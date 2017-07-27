const commandLineArgs = require('command-line-args');
const getUsage = require('command-line-usage');
const package = require('./package.json');
const winston = require('winston');
const fs = require("fs-extra-promise");
const bluebird = require("bluebird");

const codeMigrate = require("./src/migrate-code.js");

const argsOptions = [
  {
    name: 'codeplex-url',
    typeLabel: '[underline]{codeplex-url}',
    defaultOption: true,
    description: 'Codeplex project URL'
  },
  {
    name: 'help',
    alias: 'h',
    type: Boolean,
    description: 'Print this usage guide.'
  },
  {
    name: 'version',
    alias: 'v',
    type: Boolean,
    description: 'Print version of tool'
  },
  { name: 'no-code', type: Boolean, defaultValue: false, description: "Disables source code migration" },
  { name: 'no-issues', type: Boolean, defaultValue: false, description: "Disables issues migration" },
  { name: 'no-discussion', type: Boolean, defaultValue: false, description: "Disables discussion migration" },
  { name: 'no-downloads', type: Boolean, defaultValue: false, description: "Disables downloads migration" },
  { name: 'no-documentation', defaultValue: false, type: Boolean, description: "Disables documentation migration" },
  { name: 'debug', alias: "d", defaultValue: false, type: Boolean, description: "Enables debug mode" },
  { name: 'github-token', alias: "t", type: String, description: "GitHub Token key" },
  { name: 'github-repository-ssh', alias: "r", type: String, description: "Target GitHub repository SSH" }
];

global.args = commandLineArgs(argsOptions);

const sections = [
  {
    header: 'codeplex-migration-tool ' + package.version,
    content: 'Tool for migrate CodePlex project as viewer. Migrate code with commit history, home, discussions, issues, downloads and others'
  },
  {
    header: 'Usage',
    content: [
      '$ codeplex-migration-tool [[bold]{--no-code} [bold]{--no-issues} [bold]{--no-discussion} [bold]{--no-downloads} [bold]{--no-documentation}] [bold]{--github-token,-t} [underline]{github-api-key} [bold]{--github-repository-ssh,-r} [underline]{github-repository-ssh} [bold]{--username,-u} [underline]{github-username} [underline]{codeplex-url}',
    ]
  },
  {
    header: 'Options',
    optionList: argsOptions
  },
  {
    content: 'Project home: [underline]{https://github.com/gamelaster/codeplex-migration-tool}'
  }
];

if(args["github-token"] == null || args["codeplex-url"] == null || args["github-repository-ssh"] == null || args["help"] == true) {
  const usage = getUsage(sections);
  return console.log(usage);
}

global.logger = new (winston.Logger)({
  transports: [
    new (winston.transports.Console)({
      colorize: true,
      formatter: function(options) {
        return '[' + new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '') +'] '+ winston.config.colorize(options.level, options.level.toUpperCase()) +' '+ (options.message ? options.message : '') +
          (options.meta && Object.keys(options.meta).length ? '\n\t'+ JSON.stringify(options.meta) : '' );
      },
      level: args.debug == true ? "debug" : "info"
    })
  ]
});
/*
try {
  fs.removeSync("./cache/");
}
catch(ex) {

}
fs.mkdirpSync("cache");*/

logger.info('codeplex-migration-tool ' + package.version);


bluebird.try(function() {
  if(args["no-code"] == false) {
    return codeMigrate.execute();
  }
}).then(function() {
  if(args["no-code"] == false) {
    return codeMigrate.execute();
  }
});
