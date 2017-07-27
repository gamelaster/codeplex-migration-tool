const cheerio = require('cheerio');
const request = require('request-promise');
const http = require('http');
const bluebird = require('bluebird');
const cookie = require('cookie');
const fs = require("fs-extra-promise");
const parseDomain = require("parse-domain");
const decompress = require('decompress');
const Git = require("nodegit");
const j = request.jar();
let projectName = "";
 
function getProjectCommits() {
  logger.info("Loading changesets...");
  logger.debug("Loading URL: " + args["codeplex-url"] + "SourceControl/list/changesets");
  let commits = [];
  return request({
    url: args["codeplex-url"] + "SourceControl/list/changesets",
    jar: j,
  }).then(function(html) {
    let $ = cheerio.load(html);
    let pages = $(".pagination_pages li");
    //sorry for this non elegant way
    let pagesArr = [];
    for(let i = 0; i < (pages.length - 2); i++) {
      pagesArr.push(i + 1);
    }
    return pagesArr;
  }).map(function(page) {
    logger.debug("Loading URL: " + args["codeplex-url"] + "SourceControl/list/changesets/?page=" + page);
    return request(args["codeplex-url"] + "SourceControl/list/changesets?page=" + page).then(function(html) {
      let $ = cheerio.load(html);
      $("#source_code tr").each(function(i) {
        let row = $(this);
        if(row.hasClass("border")) return true;
        let cols = row.children("td");
        let associatedRelease = null;
        if(row.hasClass("associated_release")) {
          
        }
        commits.push({
          changeSet: $(cols.get(0)).find("a").first().text(),
          author: $(cols.get(0)).find("a").length == 1 ? $(cols.get(0)).find("span").first().attr("title") : $(cols.get(0)).find("a").last().text(),
          date: new Date($(cols.get(1)).find("span").first().text() + " " + $(cols.get(1)).find("span").last().text() + " GMT")
        });
      });
    });
  }).then(function() {
    return commits;
  })
  .map(function(commit) {
    logger.info("Loading changeSet #" + commit.changeSet);
    logger.debug(args["codeplex-url"] + "SourceControl/changeset/" + commit.changeSet);
    return request(args["codeplex-url"] + "SourceControl/changeset/" + commit.changeSet).then(function(html) {
      let $ = cheerio.load(html);
      commit.message = $("#DiffHeader .page_title").first().text().trim();
      commit.description = $(".expanded_comment").length != 0 ? $(".expanded_comment").html().trim().slice(0, -4).trim().replace("<br>", "\n") : "";
      return commit;
    });
  });
}

function downloadFile(url, path) {
  return new bluebird(function(resolve, reject) {
    var file = fs.createWriteStream(path);
    var request = http.get(url, function(response) {
      response.pipe(file);
      file.on('finish', function() {
        file.close(resolve);
      });
    }).on('error', function(err) {
      fs.unlink(dest);
      reject(err);
    });
  });
}

function downloadCommit(commit) {
  /*logger.debug("Loading URL: " + args["codeplex-url"] + "sourcecontrol/captureDownload");
  var cookies = cookie.parse(j.getCookieString("https://codeplex.com/"));
  return request({
    url: args["codeplex-url"] + "/sourcecontrol/captureDownload",
    method: 'POST',
    jar: j,
    form: {
      changeSetId: commit.changeSet,
      __RequestVerificationToken: cookies["__RequestVerificationToken"]
    },
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/60.0.3112.72 Safari/537.36",
      "Referer": "https://fw1.codeplex.com/SourceControl/changeset/" + commit.changeSet
    },
    gzip: true,
    resolveWithFullResponse: true
  }).then(function(response) {
    console.log(response.headers);
  });*/
  //I don't know why but it's Codeplex servers send empty response, so... :-(
  logger.debug("Download URL: http://download-codeplex.sec.s-msft.com/Download/SourceControlFileDownload.ashx?ProjectName="+projectName+"&changeSetId="+commit.changeSet);  
  return downloadFile("http://download-codeplex.sec.s-msft.com/Download/SourceControlFileDownload.ashx?ProjectName="+projectName+"&changeSetId="+commit.changeSet, "./cache/" + projectName + "_" + commit.changeSet + ".zip")
    .then(function() {
      commit.file = "./cache/" + projectName + "_" + commit.changeSet + ".zip";
      return commit;
    });
}

function clearDirectory(path) {
  return fs.readdirAsync(path).each(function(file) {
    if(file == ".git") return;
    return fs.removeAsync(file);
  });
}

function execute() {
  logger.info("Begin scrapping the commits");
  projectName = parseDomain(args["codeplex-url"]).subdomain;
  let repository = null;  
  let index = null;
  let oid = null;
  let remote = null;
  let firstCommit = false;
  return getProjectCommits().mapSeries(function (commit) {
    return downloadCommit(commit);
  })
  .then(function(commits) {
    commits.reverse();
    return commits;
  }).then(function(commits) {
    return fs.mkdirAsync("./repo").then(function() {
      return Git.Repository.initExt("./repo/", {})
    }).then(function(repo) {
      repository = repo;
      return Git.Remote.create(repository, "origin", args["github-repository-ssh"]);
    }).then(function(remoteResult) {
      remote = remoteResult;
      return commits;
    });
  }).each(function(commit) {
    logger.info("Unzipping " + commit.file);
    return clearDirectory("./repo/").then(function() {
      return decompress(commit.file, './repo/')
    }).then(function(files) {
      return repository.refreshIndex();
    }).then(function(indexResult) {
      index = indexResult;
      return index.addAll();
    }).then(function() {
      return index.writeTree();
    })
    .then(function(oidResult) {
      oid = oidResult;
    })
    .then(function() {
      if(firstCommit == false) {
        firstCommit = true;
        return null;
      }
      else {
        return Git.Reference.nameToId(repository, "HEAD")
        .then(function(head) {
          return repository.getCommit(head);
        });
      }
    })
    .then(function(parent) {
      var author = Git.Signature.create(commit.author, projectName + "@codeplex.com", parseInt((commit.date.getTime() / 1000).toFixed(0)), 0);

      return repository.createCommit("HEAD", author, author, commit.message + "\n\n" + commit.description, oid, parent == null ? [] : [parent]);
    })
  }).then(function() {
    logger.info("Code repository is done! For commit go to repo directory and type git push origin master");
  });
}

module.exports = {
  execute
};