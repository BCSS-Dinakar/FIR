const searchBNS = require("../../services/bnsSearch");

async function run() {
    console.log("Querying ChromaDB...");
    const result = await searchBNS("someone stolen my mobile phone");
    console.log(result);
}

run();
