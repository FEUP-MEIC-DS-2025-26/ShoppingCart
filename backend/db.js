// Legacy sqlite helper (kept for compatibility). Functionality is deprecated.
module.exports = {
  db: null,
  initDb: async () => {
    console.warn('legacy initDb called: sqlite helper is deprecated in favor of Postgres.');
    return null;
  },
  upsertProductFromJumpseller: async (product) => {
    console.warn('legacy upsertProductFromJumpseller called: this is a no-op in the Postgres migration.');
    return null;
  }
};