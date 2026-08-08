// import express from "express";
// import cors from "cors";
// import sensorRoutes from "./routes/sensorRoutes.js";

// const app = express();

// app.use(cors());
// app.use(express.json());

// app.use("/api/sensors", sensorRoutes);

// export default app;


import express from "express";
import cors from "cors";
import sensorRoutes from "./routes/sensor.route.js";

const app = express();

app.use(cors());
app.use(express.json());
app.use("/api/sensors",sensorRoutes);

export default app;
