var config = {
  wp: {
    username: process.env.WP_USERNAME,
    password: process.env.WP_PASSWORD,
    apikey: process.env.WP_APIKEY,
    baseurl: process.env.WP_BASEURL
  },
  pm: {
    host: process.env.PM_DB_HOST,
    password: process.env.PM_DB_PASSWORD,
    user: process.env.PM_DB_USER,
    name: process.env.PM_DB_NAME,

  },
  wordpress: {
    username: process.env.WORDPRESS_USERNAME,
    password: process.env.WORDPRESS_APP_PASSWORD,
    base_url: process.env.WORDPRESS_BASE_URL
  }
}

module.exports = config
