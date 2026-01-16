import express from "express";

const app = express();
const port = process.env.MOCK_SHOPIFY_PORT || 4001;

app.get("/", (req, res) => {
  res.send("Mock Shopify API");
});

app.listen(port, () => {
  console.log(`Mock Shopify listening on port ${port}`);
});
