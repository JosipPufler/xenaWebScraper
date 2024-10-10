const cheerio = require('cheerio');
const puppeteer = require('puppeteer');
const https = require('https');
const fs = require('fs');
const path = require('path')
const gunzip = require('gunzip-file')
const { Cluster } = require('puppeteer-cluster');

async function sleep(milliseconds) {
    var start = new Date().getTime();
    for (var i = 0; i < 1e7; i++) {
        if ((new Date().getTime() - start) > milliseconds){
        break;
        }
    }
}

function string_between_strings(startStr, endStr, str) {
    pos = str.indexOf(startStr) + startStr.length;
    return str.substring(pos, str.indexOf(endStr, pos));
}

async function cheerioFind(page, expression){
    bodyHTML = await page.evaluate(() => document.body.innerHTML);
    $ = cheerio.load(bodyHTML);
    return $(expression);
}

async function download(urls) {
    let folderName = 'TCGA'
    if (!fs.existsSync(folderName)) {
        fs.mkdirSync(folderName);
    }
    for(let i = 0 ; i < urls.length ; i++){
        let dest = path.join(__dirname, folderName, string_between_strings("download/TCGA.", ".sampleMap", urls[i]) + ".gz");
        https.get(urls[i], function(response) {
            let file = fs.createWriteStream(dest);
            response.pipe(file);
            file.on('finish', function() {
                file.close();
                gunzip(dest, dest.replace('.gz', '.tsv'), () => {
                    fs.unlink(dest, (err) => {
                        if (err) throw err;
                            console.log(dest + ' was deleted');
                      });
                })
            });
            
        });
    }
}

async function downloadOne(url) {
    let folderName = 'TCGA'
    if (!fs.existsSync(folderName)) {
        fs.mkdirSync(folderName);
    }
    let dest = path.join(__dirname, folderName, string_between_strings("download/TCGA.", ".sampleMap", url) + ".gz");
    https.get(url, function(response) {
        let file = fs.createWriteStream(dest);
        response.pipe(file);
        file.on('finish', function() {
            file.close();
            gunzip(dest, dest.replace('.gz', '.tsv'), () => {
                fs.unlink(dest, (err) => {
                    if (err) throw err;
                });
            })
        });
        
    });
}

const baseUrl = 'https://xenabrowser.net/datapages/'
const tcgaLink = 'https://xenabrowser.net/datapages/?host=https%3A%2F%2Ftcga.xenahubs.net&removeHub=https%3A%2F%2Fxena.treehouse.gi.ucsc.edu%3A443'
const cohortLinks = [];
const datasetLinks = [];
const downloadLinks = [];

(async () => {
    console.time();
    const browser = await puppeteer.launch({
        headless: true
    });
    const page = await browser.newPage();

    try {
        await page.goto(tcgaLink, { waitUntil: 'networkidle0' });
        let bodyHTML = await page.evaluate(() => document.body.innerHTML);
        
        let $ = cheerio.load(bodyHTML);
        let articleHeadlines = $('a[href*="?cohort=TCGA"]')
        articleHeadlines.each((index, element) => {
            query = $(element).attr('href')
            cohortLinks.push(
                baseUrl + query
            )
        })

        console.log(cohortLinks)
        console.log(cohortLinks.length)

        for (let i = 0; i < cohortLinks.length; i++) {
            //Ovo je sigurnija varijanta ali traje duže
            //await page.goto(cohortLinks[i], { waitUntil: ['domcontentloaded', 'networkidle0', 'load'] })
            await page.goto(cohortLinks[i])
            sleep(500)
            bodyHTML = await page.evaluate(() => document.body.innerHTML);
            $ = cheerio.load(bodyHTML);
            let datasetAnchor = $('a:contains("IlluminaHiSeq pancan normalized")')
            if(datasetAnchor.length == 1){
                datasetLinks.push(
                    baseUrl + datasetAnchor.attr('href')
                )
            }
        }

        console.log(datasetLinks)
        console.log(datasetLinks.length)

        for (let i = 0; i < datasetLinks.length; i++) {
            await page.goto(datasetLinks[i])
            sleep(1000)
            bodyHTML = await page.evaluate(() => document.body.innerHTML);
            $ = cheerio.load(bodyHTML);
            let downloadAnchors = $('a[href*=".gz"]')
            downloadAnchors.each((index, element) => {
                query = $(element).attr('href')
                downloadLinks.push(query)
                //Probao sam jedan po jedan skidati ali je ispalo sporije
                //downloadOne(query)
            })
        }

        console.log(downloadLinks)
        console.log(downloadLinks.length)

        await download(downloadLinks)
    }
    catch(err) {
        console.log(err);
    }
    await browser.close();
    console.timeEnd()
})();
return;