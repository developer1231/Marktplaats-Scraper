This is a JS-based web scraper for Marktplaats, designed to automatically check for new listings every 30 minutes and save them into a database. This project is ideal for those who want to keep track of new listings without manually refreshing the website.

# Features

Automated Scraping: Runs every 30 minutes to check for new listings.
Data Storage: Saves new listings into a database for easy access and management.
Configurable Parameters: Customize search queries, categories, and more.

# Prerequisites

Axios
Cheerio
SQLite3

# Installation
Clone the Repository:
```
git clone https://github.com/yourusername/marktplaats-scraper.git
cd marktplaats-scraper
npm i --save
```

# Manually inject links
As this scraper is part of a larger, but private infrastructure, 
we are manually having to inject links to scrape. These links should be sub/or categories of marktplaats listings to listen to.

```
Create a new code block and execute the following snippet.
example:
(async() => {
await execute(`INSERT INTO links (id, link, categorie_id) VALUES (?, ? ,?), [id_hier, link_hier, category_hier]);
})()
```
Now simply run the code and look at the database for new listings.
New listings should contain a sent field, set to false. If the sent is set to true, it means that the listing is already sent to the frontend.
This listing scraoer bot was essentailly used to connect to the frontend. However, now as it's standalone, the sent field tells us information about whether the listing has already been discovered before or not.

# Contributing

- Fork the repository.
- Create a new branch (git checkout -b feature-branch).
- Make your changes and commit them (git commit -am 'Add new feature').
- Push to the branch (git push origin feature-branch).
- Create a new Pull Request.
