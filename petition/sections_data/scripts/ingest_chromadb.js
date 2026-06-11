const { ChromaClient } = require('chromadb');
const { generateOllamaEmbedding } = require('../../ollamaService');
const bnsSections = require('../bns_sections.json');

const COLLECTION_NAME = 'bns_collection';
const client = new ChromaClient({ path: "http://localhost:8000" });

async function runIngestion() {
    console.log(`Connecting to ChromaDB at http://localhost:8000...`);
    
    // Test connection
    try {
        await client.heartbeat();
        console.log("Connected successfully!");
    } catch (e) {
        console.error("Failed to connect to ChromaDB. Ensure it is running on port 8000.");
        process.exit(1);
    }

    // Reset collection if it exists
    try {
        await client.deleteCollection({ name: COLLECTION_NAME });
        console.log(`Deleted existing collection: ${COLLECTION_NAME}`);
    } catch (e) {
        // Ignored if doesn't exist
    }

    console.log(`Creating collection: ${COLLECTION_NAME}...`);
    const collection = await client.createCollection({ name: COLLECTION_NAME });

    console.log(`Starting ingestion of ${bnsSections.length} sections... This will take a while.`);

    // Batch insertion to avoid overwhelming Ollama
    const BATCH_SIZE = 50; 
    
    for (let i = 0; i < bnsSections.length; i += BATCH_SIZE) {
        const batch = bnsSections.slice(i, i + BATCH_SIZE);
        console.log(`Processing batch ${i / BATCH_SIZE + 1}/${Math.ceil(bnsSections.length / BATCH_SIZE)}...`);

        const ids = [];
        const metadatas = [];
        const documents = [];
        const embeddings = [];

        for (const section of batch) {
            // Combine title and content for optimal semantic meaning
            const fullText = `Section ${section.section}: ${section.title}\n\n${section.content}`;
            
            try {
                // Get embedding from Ollama (slice to 4000 characters to prevent context-limit 500 errors)
                const embedding = await generateOllamaEmbedding(fullText.slice(0, 4000));

                ids.push(section.section);
                metadatas.push({ title: section.title, section: section.section });
                documents.push(fullText);
                embeddings.push(embedding);
            } catch (err) {
                console.error(`Failed to embed Section ${section.section}: ${err.message}`);
            }
        }

        // Insert batch into Chroma
        if (ids.length > 0) {
            await collection.add({
                ids: ids,
                metadatas: metadatas,
                documents: documents,
                embeddings: embeddings
            });
            console.log(`Inserted ${ids.length} sections into ChromaDB.`);
        }
    }

    console.log('Ingestion complete!');
    const count = await collection.count();
    console.log(`Total documents in ChromaDB: ${count}`);
}

runIngestion();
