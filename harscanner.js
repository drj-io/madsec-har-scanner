(async function () {
  const fs = require('fs')
  const postman = require('./lib/postman.js')
  const _ = require('lodash')

  console.log('USAGE: node harcscanner.js [filename.har] [config.json]\n')

  if (!process.argv[2]) {
    console.log('no file name specified')
    process.exit(1)
  }

  const har = require(process.argv[2])
  const config = require(process.argv[3])
  if (typeof _.get(har, ['log', 'entries', 'length']) !== 'number' || _.get(har, ['log', 'entries', 'length']) < 1) {
    console.log('no entries in log file')
    process.exit(1)
  }
  const postmanResult = postman.getPostmanDefaultSchema()

  const tokenValues = {}

  for (const i in config.TokenizePathData) {
    if (tokenValues[config.TokenizePathData[i].token] === undefined) tokenValues[config.TokenizePathData[i].token] = []
  }
  for (const i in config.TokenizeHeaderData) {
    if (tokenValues[config.TokenizeHeaderData[i].token] === undefined) tokenValues[config.TokenizeHeaderData[i].token] = []
  }

  console.log(`${_.get(har, ['log', 'entries', 'length'])} entries in log file`)
  console.log(`logging ${config.IncludeHost}`)

  postmanResult.info.name = `${config.IncludeHost} ${new Date().toISOString()}`
  for (const entryIndex in har.log.entries) {
    const entry = har.log.entries[entryIndex]
    const parsedUrl = new URL(entry.request.url)

    const host = parsedUrl.host
    const path = parsedUrl.pathname

    if (host === config.IncludeHost) {
      let exclude = false

      // Check to see if the route is included
      for (const regI in config.ExcludeRouteRegex) {
        const reg = config.ExcludeRouteRegex[regI]
        if (path.match(reg)) exclude = true
      }

      // If route should be included
      if (!exclude) {
        const { newPath, newTokenValues } = replacePathTokens(path + parsedUrl.search, config.TokenizePathData)
        // tokenize headers

        for (const headerI in entry.request.headers) {
          const header = entry.request.headers[headerI]
          for (const TokenizeHeaderDataI in config.TokenizeHeaderData) {
            const tokenConfig = config.TokenizeHeaderData[TokenizeHeaderDataI]

            if (header.name === tokenConfig.HeaderProperty) {
              const newHeaderValue = replacePathTokens(header.value, [tokenConfig])
              entry.request.headers[headerI].value = newHeaderValue.newPath
            }
          }
        }

        console.log(`${entry.request.method} - ${parsedUrl.origin}${newPath}`)

        for (const tokenValuesI in tokenValues) {
          if (!tokenValues[tokenValuesI].includes(newTokenValues[tokenValuesI]) && newTokenValues[tokenValuesI] !== undefined) tokenValues[tokenValuesI].push(newTokenValues[tokenValuesI])
        }

        const queryArr = []
        const query = newPath.split('?')[1]

        if (query && query.length > 0) {
          const queryElements = query.split('&')
          if (queryElements.length > 0) {
            // console.log(queryElements)
            queryElements.forEach(function (e, i) {
              let s = e.split('=')
              queryArr.push({ key: s[0], value: s[1] })
            })
          } else {
            let s = query.split('=')
            queryArr.push({ key: s[0], value: s[1] })
          }
        }
        const postmanHeaders = []

        for (const headerI in entry.request.headers) {
          const header = entry.request.headers[headerI]

          if (config.IncludeHeaders.includes(header.name)) {
            postmanHeaders.push({
              key: header.name,
              value: header.value,
              type: 'text'
            })
          }
        }

        const postmanItem = {
          name: `${entry.request.method} - ${parsedUrl.origin}${newPath}`,
          request: {
            method: entry.request.method,
            header: postmanHeaders,
            url: {
              raw: `${parsedUrl.origin}${newPath}`,
              protocol: parsedUrl.protocol.split(':')[0],
              host: parsedUrl.host.split('.'),
              path: (newPath.split('?')[0].split('/')).slice(1),
              query: queryArr
            }
          },
        }
        postmanResult.item.push(postmanItem)
      }
    }
  }

  for (const tokenI in tokenValues) {
    const token = tokenValues[tokenI]
    let value = ''
    if (token.length > 1) {
      console.log(`more than one value for token ${tokenI}`)
    }
    if (token.length > 0) {
      value = token[0]
    }
    postmanResult.variable.push({ key: tokenI, value })
  }

  // console.log(JSON.stringify(postmanResult, null, 2))
  fs.writeFile('output.json', JSON.stringify(postmanResult, null, 2), function (err) {
    if (err) {
      return console.log(err)
    }
    console.log('The file was saved!')
  })
})()

function replacePathTokens (inputPath, TokenizePathData) {
  const tokenValues = {}
  for (const tokenConfigI in TokenizePathData) {
    const tokenConfig = TokenizePathData[tokenConfigI]
    tokenValues[tokenConfig.token] = []

    const regexFlags = tokenConfig.regexFlags || 'g'
    const re = new RegExp(tokenConfig.match, regexFlags);
    const matches = Array.from(inputPath.matchAll(re))

    let newPath = ''
    let pos = 0
    for (const matchI in matches) {
      const match = matches[matchI]
      const matchStart = match.index
      const matchEnd = match.index + match[0].length

      const tokenValue = inputPath.substring(matchStart, matchEnd)
      tokenValues[tokenConfig.token] = tokenValue
      newPath += inputPath.substring(pos, matchStart) + '{{' + tokenConfig.token + '}}'

      pos = matchEnd
    }

    newPath += inputPath.substring(pos,inputPath.length)

    inputPath = newPath
  }

  // remove empty token
  const newTokenValues = {}
  for (const tokenValueI in tokenValues) {
    if (tokenValues[tokenValueI].length > 0) newTokenValues[tokenValueI] = tokenValues[tokenValueI]
  }

  return { newPath: inputPath, newTokenValues }
}
