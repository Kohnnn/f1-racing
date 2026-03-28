import { fetchSessionMetadata } from "./openf1-client.mjs";

async function main() {
  const [year, countryName, sessionName] = process.argv.slice(2);

  if (!year || !countryName || !sessionName) {
    console.error("Usage: node fetch-session-metadata.mjs <year> <countryName> <sessionName>");
    process.exit(1);
  }

  const data = await fetchSessionMetadata({
    year,
    countryName,
    sessionName,
  });

  process.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
