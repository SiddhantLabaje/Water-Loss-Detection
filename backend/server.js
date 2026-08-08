import dotenv from "dotenv";
dotenv.config();

import connectDatabase from "./config/db.js";
import app from "./app.js";

import "./services/cronJob.service.js";

connectDatabase();

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});