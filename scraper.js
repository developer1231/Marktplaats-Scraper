const sqlite3 = require("sqlite3").verbose();
const db = new sqlite3.Database("program.db");
const puppeteer = require("puppeteer");
const cheerio = require("cheerio");
const fs = require("fs");
const proxies = fs
  .readFileSync("./proxies.txt", "utf8")
  .split("\r\n")
  .map((proxy) => {
    const [ip, port, username, password] = proxy.split(":");
    return { ip, port, username, password };
  });
function execute(query, params = []) {
  return new Promise((resolve, reject) => {
    db.all(query, params, function (err, rows) {
      if (err) {
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
}

function run(query, params = []) {
  return new Promise((resolve, reject) => {
    db.run(query, params, function (err) {
      if (err) {
        reject(err);
      } else {
        resolve({ lastID: this.lastID, changes: this.changes });
      }
    });
  });
}

async function Initialization() {
  try {
    await run(`CREATE TABLE IF NOT EXISTS links (
      id TEXT PRIMARY KEY,
      link TEXT NOT NULL,
      category_id TEXT NOT NULL
    )`);
    console.log("Table 'links' created.");

    await run(`CREATE TABLE IF NOT EXISTS scraped_data (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT,
      price TEXT,
      description TEXT,
      seller TEXT,
      location TEXT,
      priority TEXT,
      date TEXT,
      link TEXT,
      image TEXT,
      sent TEXT NOT NULL,
      base_category TEXT NOT NULL
    )`);
    console.log("Table 'scraped_data' created.");

    await scrapeData(true);
  } catch (err) {
    console.error("Initialization error:", err);
  }
}

function checkDuplicates(str) {
  let regex = /(\S+\s?\S*)\1+/g;
  return str.replace(regex, "$1");
}

async function singlePreload(url, proxyIndex = 0) {
  let closed = false;
  console.log(
    "----------------------------------------------------------------"
  );
  console.log("Processing URL:", url);
  const { ip, port, username, password } = proxies[proxyIndex];
  console.log("Using proxy:", ip, "Port:", port);

  let browser;
  let totalBytes = 0;
  const data = [];

  try {
    browser = await puppeteer.launch({
      args: [`--proxy-server=${ip}:${port}`],
    });

    const page = await browser.newPage();
    await page.authenticate({
      username: username,
      password: password,
    });

    page.on("response", async (response) => {
      try {
        const buffer = await response.buffer();
        totalBytes += buffer.length;
      } catch (error) {}
    });

    await page.goto(url);
    console.log("Page loaded successfully");

    await page.waitForSelector(".hz-Listing-item-wrapper");
    console.log("Selector found");

    const html = await page.content();
    const $ = cheerio.load(html);

    $(".hz-Listing-item-wrapper").each(async (index, element) => {
      try {
        const title = $(element).find(".hz-Listing-title").text().trim();
        const price = $(element).find(".hz-Listing-price").text().trim();
        const description = $(element)
          .find(".hz-Listing-description")
          .text()
          .trim();
        const seller = $(element).find(".hz-Listing-seller-name").text().trim();
        const location = $(element)
          .find(".hz-Listing-location .hz-Listing-distance-label")
          .text()
          .trim();
        const priority = $(element)
          .find(".hz-Listing-priority span")
          .text()
          .trim();
        const date = $(element).find(".hz-Listing-date").text().trim();
        const imageUrl = $(element).find("img").attr("src");
        const visitWebsite = $(element)
          .find(".hz-Listing-seller-external-link a")
          .text()
          .trim();

        const sanitizedTitle = checkDuplicates(title);
        const sanitizedDate = checkDuplicates(date);
        const sanitizedPriority = checkDuplicates(priority);
        let base = url.split("#")[0];
        const visitWebsiteLink = `${base}#q:${(sanitizedTitle + " " + seller)
          .replaceAll(" ", "+")
          .toLowerCase()}|sortBy:SORT_INDEX|sortOrder:DECREASING|searchInTitleAndDescription:true`;

        const existingData = await execute(
          `SELECT * FROM scraped_data WHERE title = ?`,
          [sanitizedTitle]
        );
        data.push({
          title: sanitizedTitle,
          price,
          description,
          seller,
          location,
          priority,
          date: sanitizedDate,
          link: visitWebsiteLink,
          image: imageUrl,
        });
        if (
          existingData.length == 0 &&
          sanitizedPriority !== "Dagtopper" &&
          sanitizedPriority !== "Topadvertentie" &&
          !visitWebsite
        ) {
          await run(
            `INSERT INTO scraped_data (title, price, description, seller, location, priority, date, link, image, sent, base_category) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?,  ?)`,
            [
              sanitizedTitle,
              checkDuplicates(price),
              description,
              checkDuplicates(seller),
              checkDuplicates(location),
              checkDuplicates(priority),
              sanitizedDate,
              visitWebsiteLink,
              imageUrl,
              "true",
              url,
            ]
          );
        }
      } catch (error) {
        console.error("Error processing element:", error);
      }
    });
  } catch (error) {
    if (proxyIndex < proxies.length - 1) {
      console.log("Proxy on cooldown. Retrying with a different proxy...");
      if (browser && !closed) {
        closed = true;
        const pages = await browser.pages();
        await Promise.all(pages.map((page) => page.close()));
        await browser.close();
      }
      return await singlePreload(url, proxyIndex + 1);
    } else {
      console.error("All proxies failed. Skipping URL:", url);
    }
  } finally {
    if (browser && !closed) {
      closed = true;
      const pages = await browser.pages();
      await Promise.all(pages.map((page) => page.close()));
      await browser.close();
    }
    console.log(
      "Total bandwidth used:",
      (totalBytes / (1024 * 1024)).toFixed(2),
      "MB"
    );
    console.log("Data:", data);
    console.log(
      "----------------------------------------------------------------"
    );
  }
}

async function scrapeData(firstTime, startIndex = 0, proxyIndex = 0) {
  let data = await execute(`SELECT * FROM links`);
  const { ip, port, username, password } = proxies[proxyIndex];
  const browser = await puppeteer.launch({
    args: [`--proxy-server=${ip}:${port}`],
  });

  try {
    for (let i = startIndex; i < data.length; i++) {
      let url = data[i].link;
      console.log("Processing URL:", url);
      console.log("Using proxy:", ip, "Port:", port);
      const page = await browser.newPage();
      await page.authenticate({
        username: username,
        password: password,
      });
      let totalBytes = 0;
      const newData = [];

      try {
        page.on("response", async (response) => {
          try {
            const buffer = await response.buffer();
            totalBytes += buffer.length;
          } catch (error) {}
        });

        await page.goto(url);
        console.log("Page loaded successfully");

        await page.waitForSelector(".hz-Listing-item-wrapper");
        console.log("Selector found");

        const html = await page.content();
        const $ = cheerio.load(html);
        let items = $(".hz-Listing-item-wrapper").toArray();
        let itemCount = parseInt(items.length * 0.75);
        console.log("Item count:", itemCount);

        for (let j = 0; j < itemCount; j++) {
          let element = items[j];
          const title = $(element).find(".hz-Listing-title").text().trim();
          const price = $(element).find(".hz-Listing-price").text().trim();
          const description = $(element)
            .find(".hz-Listing-description")
            .text()
            .trim();
          const seller = $(element)
            .find(".hz-Listing-seller-name")
            .text()
            .trim();
          const location = $(element)
            .find(".hz-Listing-location .hz-Listing-distance-label")
            .text()
            .trim();
          const priority = $(element)
            .find(".hz-Listing-priority span")
            .text()
            .trim();
          const date = $(element).find(".hz-Listing-date").text().trim();
          const imageUrl = $(element).find("img").attr("src");
          const visitWebsite = $(element)
            .find(".hz-Listing-seller-external-link a")
            .text()
            .trim();

          const sanitizedTitle = checkDuplicates(title);
          const sanitizedDate = checkDuplicates(date);
          const sanitizedPriority = checkDuplicates(priority);
          let base = url.split("#")[0];
          const visitWebsiteLink = `${base}#q:${(sanitizedTitle + " " + seller)
            .replaceAll(" ", "+")
            .toLowerCase()}|sortBy:SORT_INDEX|sortOrder:DECREASING|searchInTitleAndDescription:true`;

          const existingData = await execute(
            `SELECT * FROM scraped_data WHERE title = ?`,
            [sanitizedTitle]
          );

          if (
            !visitWebsite &&
            existingData.length == 0 &&
            sanitizedPriority !== "Dagtopper" &&
            sanitizedPriority !== "Topadvertentie"
          ) {
            await run(
              `INSERT INTO scraped_data (title, price, description, seller, location, priority, date, link, image, sent, base_category) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                sanitizedTitle,
                checkDuplicates(price),
                checkDuplicates(description),
                checkDuplicates(seller),
                checkDuplicates(location),
                checkDuplicates(priority),
                sanitizedDate,
                visitWebsiteLink,
                imageUrl,
                firstTime ? "true" : "false",
                url,
              ]
            );
            newData.push({
              title: sanitizedTitle,
              price,
              description,
              seller,
              location,
              priority,
              date: sanitizedDate,
              link: visitWebsiteLink,
              image: imageUrl,
            });
          }
        }
      } catch (error) {
        if (proxyIndex < proxies.length - 1) {
          console.log("Proxy on cooldown. Retrying with a different proxy...");
          if (browser) {
            const pages = await browser.pages();
            await Promise.all(pages.map((page) => page.close()));
            await browser.close();
          }
          await scrapeData(firstTime, i, proxyIndex + 1);
          return;
        } else {
          console.error("All proxies failed. Skipping URL:", url);
        }
      } finally {
        await page.close();
        if (newData.length > 0) {
          console.log("New items found:\n", newData);
        } else {
          console.log("No new items.");
        }
        console.log(
          "Total bandwidth used:",
          (totalBytes / (1024 * 1024)).toFixed(2),
          "MB"
        );
        console.log(
          "----------------------------------------------------------------"
        );
      }
    }
  } catch (error) {
  } finally {
    if (browser) {
      const pages = await browser.pages();
      await Promise.all(pages.map((page) => page.close()));
      await browser.close();
    }
  }
  if (startIndex == 0) {
    console.log(
      "----------------------------------------------------------------"
    );
    console.log("DONE SCRAPING EVERYTHING IN THIS ROUND.");
    console.log(
      "----------------------------------------------------------------"
    );
  }
}

module.exports = { execute, run, singlePreload, Initialization, scrapeData };
