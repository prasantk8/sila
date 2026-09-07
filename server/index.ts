import { main } from "./server.js";

main().catch((err) => {
  console.error("fatal:", err);
  process.exit(1);
});
