<p align="center"><img src="/static/node-minify.png" width="348" alt="node-minify"></p>

<p align="center">A very light minifier Node.js module.</p>

<p align="center">
  <br>
  <a href="https://npmjs.org/package/@node-minify/cli"><img src="https://img.shields.io/npm/v/@node-minify/cli.svg"></a>
  <a href="https://npmjs.org/package/@node-minify/cli"><img src="https://img.shields.io/npm/dm/@node-minify/cli.svg"></a>
  <a href="https://codecov.io/gh/srod/node-minify"><img src="https://codecov.io/gh/srod/node-minify/branch/develop/graph/badge.svg"></a><br>
  <a href="https://travis-ci.org/srod/node-minify"><img src="https://img.shields.io/travis/srod/node-minify/master.svg?label=linux"></a>
  <a href="https://dev.azure.com/srodolphe/srodolphe/_build/latest?definitionId=1"><img src="https://dev.azure.com/srodolphe/srodolphe/_apis/build/status/srod.node-minify?branchName=master"></a>
  <a href="https://circleci.com/gh/srod/node-minify/tree/master"><img src="https://circleci.com/gh/srod/node-minify/tree/master.svg?style=shield"></a>
</p>

# CLI

`CLI` is a plugin for [`node-minify`](https://github.com/srod/node-minify)

You can compress files using the command line.

## Installation

```bash
npm install -g @node-minify/cli @node-minify/uglify-js
```

## Usage

```bash
node-minify --compressor uglify-js --input 'input.js' --output 'output.js'
```

## Documentation

Visit https://node-minify.2clics.net/cli.html for full documentation

## License

[MIT](https://github.com/srod/node-minify/blob/develop/LICENSE)
