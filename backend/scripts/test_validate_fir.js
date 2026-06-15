const axios = require('axios');

async function testValidateFir() {
  // Replace this sample text with whatever you want to test!
  const sampleFirText = `
    Date: 12-06-2026
    Complainant: Ravi Kumar
    Accused: Suresh Sharma
    
    Incident Facts:
    Suresh Sharma trespassed into my home at night, stole my valuable jewelry, and when confronted, he assaulted me causing physical hurt.
    I am requesting to file an FIR for House-trespass (BNS 331), Theft (BNS 303), and Hurt (BNS 115).
  `;

  console.log("==========================================");
  console.log("📄 Sending FIR text for validation:");
  console.log("==========================================");
  console.log(sampleFirText.trim());
  console.log("==========================================");
  console.log("⏳ Waiting for RAG LLM pipeline validation...\n");

  try {
    const response = await axios.post('http://127.0.0.1:3002/validate-fir?top_k=5', sampleFirText, {
      headers: {
        'Content-Type': 'text/plain'
      }
    });

    console.log("✅ Validation Response JSON:");
    console.log(JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.error("❌ Error testing validation API:");
    if (error.response) {
      console.error(JSON.stringify(error.response.data, null, 2));
    } else {
      console.error(error.message);
    }
  }
}

testValidateFir();
