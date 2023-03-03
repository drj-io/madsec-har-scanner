(async function () {
  const harlib = require('./lib/harlib.js')
  var url = require('url')

  const _ = require('lodash')
  console.log('USAGE: node harcscanner.js [filename.har] [config.json]\n')

  if (!process.argv[2]) {
    console.log('no file name specified')
    process.exit(1)
  }

  const har = require(process.argv[2])
  const config = require(process.argv[3]);
  if (typeof _.get(har, ['log', 'entries', 'length']) !== 'number' || _.get(har, ['log', 'entries', 'length']) < 1) {
    console.log('no entries in log file')
    process.exit(1)
  }

  console.log(config)
  console.log(`${_.get(har, ['log', 'entries', 'length'])} entries in log file`)
  console.log(`logging ${config.IncludeHost}`)
  for (const entryIndex in har.log.entries) {
    const entry = har.log.entries[entryIndex]
    const parsedUrl = url.parse(entry.request.url,true)
    const host = parsedUrl.host
    const path = parsedUrl.path

    if (host === config.IncludeHost) {
      let exclude = false
      for (const regI in config.ExcludeRouteRegex) {
        const reg = config.ExcludeRouteRegex[regI]
        if (parsedUrl.path.match(reg)) exclude = true
      }
      if (!exclude) {
        console.log(`${entry.request.method} - ${entry.request.url}`)
      }
    }
  }
})()
