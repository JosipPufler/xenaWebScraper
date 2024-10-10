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
    let dest = path.join(__dirname, folderName, string_between_strings("TCGA.", ".sampleMap", url) + ".gz");
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

        const cluster = await Cluster.launch({
            concurrency: Cluster.CONCURRENCY_PAGE,
            maxConcurrency: 5,
        });

        await cluster.task(async ({ page, data: url }) => {
            page.setJavaScriptEnabled(true);
            await page.goto(url, { timeout: 0, waitUntil: ['domcontentloaded', 'networkidle0', 'load'] });
            let body = await page.evaluate(() => document.body.innerHTML);
            $ = cheerio.load(body);
            let datasetAnchor = $('a:contains("IlluminaHiSeq pancan normalized")')
            
            if(datasetAnchor.length == 1){
                console.log(url)
                await page.goto(baseUrl + datasetAnchor.attr('href'), { timeout: 0, waitUntil: ['domcontentloaded', 'networkidle0', 'load']});
                let body2 = await page.evaluate(() => document.body.innerHTML);
                $ = cheerio.load(body2);
                let downloadAnchors = $('a[href*=".gz"]');
                if(downloadAnchors.length == 1){
                    await downloadOne($(downloadAnchors).attr('href'));
                }/*else{
                    console.log(downloadAnchors.length)
                }*/
            }else{
                console.log(body)
            }
        })

        cohortLinks.forEach(link => {
            cluster.queue(link);
        });
        
        await cluster.idle();
        await cluster.close();
        await browser.close();
        console.timeEnd();
    }
    catch(err) {
        console.log(err);
    }
})();
return;