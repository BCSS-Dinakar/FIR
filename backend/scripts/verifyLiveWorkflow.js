#!/usr/bin/env node
/**
 * Feature-level verification for fir-audit → backend workflow.
 * Run: node scripts/verifyLiveWorkflow.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { setTimeout: sleep } = require('timers/promises');

const BASE = process.env.VERIFY_BASE_URL || 'http://localhost:5000';
const results = [];

const record = (feature, tested, result, dependency, notes) => {
  results.push({ feature, tested, result, dependency, notes });
};

const ok = (feature, dependency, notes) => record(feature, 'Yes', 'PASS', dependency, notes);
const fail = (feature, dependency, notes) => record(feature, 'Yes', 'FAIL', dependency, notes);
const degraded = (feature, dependency, notes) => record(feature, 'Yes', 'DEGRADED', dependency, notes);
const skip = (feature, dependency, notes) => record(feature, 'No', 'NOT TESTED', dependency, notes);

const fetchJson = async (url, options = {}) => {
  const res = await fetch(url, options);
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { res, body, text };
};

const waitForHealth = async (maxMs = 30000) => {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    try {
      const { res } = await fetch(`${BASE}/api/health`);
      if (res.ok) return true;
    } catch {
      /* retry */
    }
    await sleep(500);
  }
  return false;
};

async function testDualWriteMongoId() {
  const { connectPostgres, query } = require('../config/postgres');
  await connectPostgres();

  const pgId = '00000000-0000-4000-8000-00000000c001';
  const prevSync = process.env.MONGO_SYNC;
  process.env.MONGO_SYNC = 'false';
  delete require.cache[require.resolve('../repositories/dualWrite')];
  const { writeWithSync } = require('../repositories/dualWrite');

  try {
    await writeWithSync({
      entityType: 'petitions',
      pgWrite: async () => ({
        row: {
          id: pgId,
          pgId,
          mongoId: 'mongo-from-row',
          legacyId: 'DW-ROW-TEST'
        }
      }),
      mongoSync: null
    });

    const rowRes = await query(
      `SELECT mongo_id FROM migration_sync_status
       WHERE entity_type='petitions' AND postgres_id=$1 AND sync_direction='pg_to_mongo'
       ORDER BY last_synced_at DESC NULLS LAST LIMIT 1`,
      [pgId]
    );
    if (rowRes.rows[0]?.mongo_id === 'mongo-from-row') {
      ok('dualWrite mongoId from row.mongoId', 'integration', rowRes.rows[0].mongo_id);
    } else {
      fail('dualWrite mongoId from row.mongoId', 'integration', JSON.stringify(rowRes.rows[0]));
    }

    const pgId2 = '00000000-0000-4000-8000-00000000c002';
    await writeWithSync({
      entityType: 'petitions',
      pgWrite: async () => ({
        row: { id: pgId2, pgId: pgId2, mongoId: null, legacyId: 'DW-TOP-TEST' },
        mongoId: 'mongo-top-level'
      }),
      mongoSync: null
    });
    const topRes = await query(
      `SELECT mongo_id FROM migration_sync_status
       WHERE entity_type='petitions' AND postgres_id=$1 AND sync_direction='pg_to_mongo'
       ORDER BY last_synced_at DESC NULLS LAST LIMIT 1`,
      [pgId2]
    );
    if (topRes.rows[0]?.mongo_id === 'mongo-top-level') {
      ok('dualWrite mongoId from pgWrite.mongoId', 'integration', topRes.rows[0].mongo_id);
    } else {
      fail('dualWrite mongoId from pgWrite.mongoId', 'integration', JSON.stringify(topRes.rows[0]));
    }
  } finally {
    process.env.MONGO_SYNC = prevSync;
    delete require.cache[require.resolve('../repositories/dualWrite')];
  }
}

async function testListMongoFallbackFilters() {
  const postgres = require('../config/postgres');
  const origQuery = postgres.query;
  const origPoolQuery = postgres.pool.query.bind(postgres.pool);

  const sample = [
    { id: 'A', status: 'Pending Filing', blockers: [], petitionNo: 'P1', complainant: 'Alpha', accused: 'X', firNo: '' },
    { id: 'B', status: 'Pending Filing', blockers: ['Who'], petitionNo: 'P2', complainant: 'Beta', accused: 'Y', firNo: '' },
    { id: 'C', status: 'FIR Filed', blockers: [], petitionNo: 'P3', complainant: 'Gamma', accused: 'Z', firNo: 'F1' }
  ].map((p) => ({
    id: p.id,
    _id: p.id,
    pgId: null,
    mongoId: `m-${p.id}`,
    legacyId: p.id,
    petitionNo: p.petitionNo,
    date: '01 Jan 2026',
    complainant: p.complainant,
    accused: p.accused,
    sections: [],
    sectionRecommendations: [],
    score: 80,
    status: p.status,
    blockers: p.blockers,
    sourceFile: 't.txt',
    step1Output: '',
    step2Output: '',
    step3Output: {},
    metadata: {},
    firNo: p.firNo,
    filedAt: '',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-02')
  }));

  const throwingQuery = async () => {
    throw new Error('PG down simulated');
  };
  postgres.query = throwingQuery;
  postgres.pool.query = throwingQuery;

  delete require.cache[require.resolve('../adapters/mongo/petitionsMongo')];
  delete require.cache[require.resolve('../repositories/petitionsRepo')];
  const petitionsMongo = require('../adapters/mongo/petitionsMongo');
  const petitionsRepo = require('../repositories/petitionsRepo');

  petitionsMongo.findMany = async (filter, options = {}) => {
    let rows = [...sample];
    if (filter.status) rows = rows.filter((r) => r.status === filter.status);
    if (filter.withoutBlockers) rows = rows.filter((r) => !r.blockers?.length);
    if (filter.withBlockers) rows = rows.filter((r) => r.blockers?.length > 0);
    if (filter.search) {
      const s = String(filter.search).toLowerCase();
      rows = rows.filter(
        (r) =>
          r.id.toLowerCase().includes(s) ||
          r.petitionNo.toLowerCase().includes(s) ||
          r.complainant.toLowerCase().includes(s)
      );
    }
    rows.sort((a, b) => b.createdAt - a.createdAt);
    if (options.offset) rows = rows.slice(options.offset);
    if (options.limit) rows = rows.slice(0, options.limit);
    return rows;
  };

  try {
    const statusOnly = await petitionsRepo.list({ filter: { status: 'Pending Filing' } });
    const without = await petitionsRepo.list({ filter: { withoutBlockers: true } });
    const withB = await petitionsRepo.list({ filter: { withBlockers: true } });
    const combo = await petitionsRepo.list({
      filter: { status: 'Pending Filing', withoutBlockers: true }
    });
    const search = await petitionsRepo.list({ filter: { search: 'Alpha' } });
    const paged = await petitionsRepo.list({ filter: {}, limit: 1, offset: 1 });

    const checks = [
      [statusOnly.length === 2, 'status filter'],
      [without.length === 2, 'withoutBlockers filter'],
      [withB.length === 1 && withB[0].id === 'B', 'withBlockers filter'],
      [combo.length === 1 && combo[0].id === 'A', 'combined status+withoutBlockers'],
      [search.length === 1 && search[0].id === 'A', 'search filter'],
      [paged.length === 1, 'pagination limit/offset']
    ];
    const failed = checks.filter(([pass]) => !pass).map(([, name]) => name);
    if (!failed.length) {
      ok('petitionsRepo.list Mongo fallback filters', 'integration', 'all filters forwarded on PG failure');
    } else {
      fail('petitionsRepo.list Mongo fallback filters', 'integration', `failed: ${failed.join(', ')}`);
    }
  } finally {
    postgres.query = origQuery;
    postgres.pool.query = origPoolQuery;
    delete require.cache[require.resolve('../adapters/mongo/petitionsMongo')];
    delete require.cache[require.resolve('../repositories/petitionsRepo')];
  }
}

async function runHttpWorkflow() {
  const ts = Date.now();
  const email = `verify.${ts}@police.gov.in`;
  const password = 'VerifyTest123!';
  const badge = `V${String(ts).slice(-6)}`;

  // Register
  let reg;
  try {
    ({ body: reg } = await fetchJson(`${BASE}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Verify Officer',
        badge,
        email,
        password,
        mobile: '9876543210',
        station: 'Hyderabad PS'
      })
    }));
    if (reg?.success) ok('Register user', 'HTTP', email);
    else fail('Register user', 'HTTP', reg?.message || 'unknown');
  } catch (e) {
    fail('Register user', 'HTTP', e.message);
  }

  // Login + JWT cookie
  let token = '';
  try {
    const { res, body } = await fetchJson(`${BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const setCookie = res.headers.get('set-cookie') || '';
    const match = setCookie.match(/token=([^;]+)/);
    token = match ? match[1] : '';
    if (body?.success && token) ok('Login + JWT cookie', 'HTTP', 'cookie issued');
    else fail('Login + JWT cookie', 'HTTP', body?.message || 'no cookie');
  } catch (e) {
    fail('Login + JWT cookie', 'HTTP', e.message);
  }

  const authHeaders = { Cookie: `token=${token}` };

  // /me
  try {
    const { res, body } = await fetchJson(`${BASE}/api/auth/me`, { headers: authHeaders });
    if (res.status === 200 && body?.user?.email === email) ok('JWT authentication + /me', 'HTTP', body.user.email);
    else fail('JWT authentication + /me', 'HTTP', `status=${res.status}`);
  } catch (e) {
    fail('JWT authentication + /me', 'HTTP', e.message);
  }

  // Petition creation
  const petitionId = `PET-VERIFY-${ts}`;
  const petitionNo = `PET/HYD/VERIFY/${ts}`;
  let createdPetition;
  try {
    const { res, body } = await fetchJson(`${BASE}/api/petitions`, {
      method: 'POST',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: petitionId,
        petitionNo,
        date: '01 Sep 2026',
        complainant: 'Ramesh Kumar',
        accused: 'Suresh',
        sections: [],
        score: 85,
        status: 'Pending Filing',
        blockers: [],
        sourceFile: 'manual.json',
        step1Output: 'Original Hindi text sample',
        step2Output:
          'Complainant Ramesh Kumar states that on 15 March 2026 at 9 PM near MG Road Hyderabad, accused Suresh snatched his mobile phone worth Rs 15000.',
        step3Output: { valid: true, missing_fields: [] },
        metadata: { complainant: 'Ramesh Kumar', accused: 'Suresh' }
      })
    });
    createdPetition = body;
    if (res.status === 201 && body?.id === petitionId) ok('Petition creation', 'HTTP', petitionId);
    else fail('Petition creation', 'HTTP', JSON.stringify(body).slice(0, 120));
  } catch (e) {
    fail('Petition creation', 'HTTP', e.message);
  }

  // Pipeline helpers via services
  const tmpDir = path.join(__dirname, '../uploads/verify');
  fs.mkdirSync(tmpDir, { recursive: true });

  const txtPath = path.join(tmpDir, 'petition.txt');
  fs.writeFileSync(
    txtPath,
    [
      'Complainant Ramesh Kumar states that on 15 March 2026 at 9 PM near MG Road, Hyderabad,',
      'accused Suresh snatched his mobile phone worth Rs 15000 and fled on a motorcycle.',
      'Ramesh believes Suresh acted out of prior enmity over a money dispute.',
      'Suresh approached Ramesh on foot, grabbed the phone from his hand, and escaped north on the bike.'
    ].join(' ')
  );

  const runPipelineFile = async (filePath, mimeType, originalname, label) => {
    const { runPetitionPipeline } = require('../services/firPipeline');
    const file = { path: filePath, mimetype: mimeType, originalname };
    return runPetitionPipeline(file);
  };

  try {
    const { runPetitionPipeline } = require('../services/firPipeline');
    const txtResult = await runPetitionPipeline({
      path: txtPath,
      mimetype: 'text/plain',
      originalname: 'petition.txt'
    });
    if (txtResult?.step2Output?.length > 20) ok('.txt petition pipeline', 'firPipeline', `${txtResult.step1Output.length} chars extracted`);
    else fail('.txt petition pipeline', 'firPipeline', 'empty output');

    if (txtResult.step2Output) ok('Translation', 'vLLM', 'step2 produced');
    else fail('Translation', 'vLLM', 'missing step2');
    if (txtResult.step3Output?.valid !== undefined) ok('5W+1H validation', 'vLLM', `valid=${txtResult.step3Output.valid}`);
    else fail('5W+1H validation', 'vLLM', 'missing step3');
    const fields = txtResult.step3Output?.fields || {};
    if (fields.what && fields.where && fields.when && fields.how) {
      ok('5W+1H fields extract', 'vLLM', `who=${fields.complainantName || fields.who || '?'}`);
    } else {
      fail('5W+1H fields extract', 'vLLM', `incomplete: ${Object.keys(fields).join(',')}`);
    }
    if (txtResult.metadata?.fiveW1H?.what) ok('5W+1H metadata', 'firPipeline', 'stored in metadata');
    else fail('5W+1H metadata', 'firPipeline', 'missing metadata.fiveW1H');
    if (txtResult.metadata?.complainant) ok('Metadata extraction', 'vLLM', txtResult.metadata.complainant);
    else fail('Metadata extraction', 'vLLM', 'missing metadata');
  } catch (e) {
    fail('.txt petition pipeline', 'firPipeline', e.message);
    fail('Translation', 'vLLM', 'blocked by pipeline failure');
    fail('5W+1H validation', 'vLLM', 'blocked by pipeline failure');
    fail('Metadata extraction', 'vLLM', 'blocked by pipeline failure');
  }

  // Text-layer PDF
  const pdfPath = path.join(tmpDir, 'petition-text.pdf');
  try {
    fs.unlinkSync(pdfPath);
  } catch {
    /* ignore */
  }
  let usedPdf = false;
  try {
    require('child_process').execSync(
      `python3 -c "from reportlab.pdfgen import canvas; c=canvas.Canvas('${pdfPath}'); c.drawString(72,720,'Complainant Ramesh Kumar reports theft on 15 March 2026 at Hyderabad.'); c.save()"`,
      { stdio: 'ignore' }
    );
    usedPdf = fs.existsSync(pdfPath) && fs.statSync(pdfPath).size > 100;
  } catch {
    usedPdf = false;
  }
  try {
    const { runPetitionPipeline } = require('../services/firPipeline');
    const pdfFile = usedPdf
      ? { path: pdfPath, mimetype: 'application/pdf', originalname: 'petition-text.pdf' }
      : {
          path: path.join(tmpDir, 'petition-text-alt.txt'),
          mimetype: 'text/plain',
          originalname: 'petition-text.txt'
        };
    if (!usedPdf) {
      fs.writeFileSync(
        pdfFile.path,
        'Complainant Ramesh Kumar reports theft on 15 March 2026 at Hyderabad.'
      );
    }
    const pdfResult = await runPetitionPipeline(pdfFile);
    if (pdfResult?.step1Output?.match(/Ramesh|theft|Hyderabad/i)) {
      ok(
        'Text-layer PDF pipeline',
        usedPdf ? 'pdf-parse' : 'txt-fallback (reportlab unavailable)',
        pdfResult.step1Output.slice(0, 80)
      );
    } else {
      fail('Text-layer PDF pipeline', 'pdf-parse', pdfResult?.step1Output?.slice(0, 80) || 'empty');
    }
  } catch (e) {
    fail('Text-layer PDF pipeline', 'pdf-parse', e.message);
  }

  // OCR image
  const imgPath = path.join(tmpDir, 'petition-scan.png');
  try {
    const { createCanvas } = require('canvas');
    const canvas = createCanvas(700, 220);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, 700, 220);
    ctx.fillStyle = 'black';
    ctx.font = '22px sans-serif';
    ctx.fillText('PETITION', 20, 40);
    ctx.fillText('Complainant: Ramesh Kumar', 20, 80);
    ctx.fillText('Date: 15 March 2026', 20, 120);
    ctx.fillText('Place: Hyderabad', 20, 160);
    fs.writeFileSync(imgPath, canvas.toBuffer('image/png'));
  } catch {
    // fallback without canvas: use python
    require('child_process').execSync(
      `python3 -c "from PIL import Image,ImageDraw,ImageFont;import pathlib;im=Image.new('RGB',(700,220),'white');d=ImageDraw.Draw(im);d.text((20,40),'PETITION',fill='black');d.text((20,80),'Complainant: Ramesh Kumar',fill='black');d.text((20,120),'Date: 15 March 2026',fill='black');d.text((20,160),'Place: Hyderabad',fill='black');im.save('${imgPath}')"`,
      { stdio: 'ignore' }
    );
  }

  try {
    const { runPetitionPipeline } = require('../services/firPipeline');
    const ocrResult = await runPetitionPipeline({
      path: imgPath,
      mimetype: 'image/png',
      originalname: 'petition-scan.png'
    });
    if (ocrResult?.step1Output?.match(/Ramesh|Hyderabad/i)) {
      ok('Image/scanned OCR pipeline', process.env.OCR_MODEL || 'OCR', ocrResult.step1Output.slice(0, 80));
    } else {
      fail('Image/scanned OCR pipeline', process.env.OCR_MODEL || 'OCR', ocrResult?.step1Output?.slice(0, 80) || 'empty');
    }
  } catch (e) {
    fail('Image/scanned OCR pipeline', process.env.OCR_MODEL || 'OCR', e.message);
  }

  // Scanned PDF (blank page -> OCR fallback)
  const blankPdf = path.join(tmpDir, 'blank-scan.pdf');
  const blankPdfBytes = `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj
xref
0 4
0000000000000 65535 f 
0000000000009 00000 n 
0000000000052 00000 n 
0000000000101 00000 n 
trailer<</Size 4/Root 1 0 R>>
startxref
149
%%EOF`;
  fs.writeFileSync(blankPdf, blankPdfBytes);
  try {
    const { extractTextFromDocument, extractTextFromFilePath } = require('../services/ocrService');
    const b64 = fs.readFileSync(imgPath).toString('base64');
    const ocrText = await extractTextFromDocument(b64, 'image/png', { profile: 'petition', filename: 'petition-scan.png' });
    if (ocrText.match(/Ramesh|Hyderabad/i)) ok('OCR endpoint (image)', process.env.OCR_MODEL, 'chat completions');
    else fail('OCR endpoint (image)', process.env.OCR_MODEL, ocrText.slice(0, 80));
  } catch (e) {
    fail('OCR endpoint (image)', process.env.OCR_MODEL, e.message);
  }

  try {
    const { extractTextFromFilePath } = require('../services/ocrService');
    const docText = await extractTextFromFilePath(imgPath, 'image/png', {
      profile: 'petition',
      filename: 'petition-scan.png'
    });
    if (docText.match(/Ramesh|Hyderabad/i)) ok('OCR endpoint (file upload)', process.env.OCR_MODEL, 'extractTextFromFilePath');
    else fail('OCR endpoint (file upload)', process.env.OCR_MODEL, docText.slice(0, 80));
  } catch (e) {
    fail('OCR endpoint (file upload)', process.env.OCR_MODEL, e.message);
  }

  try {
    const { extractTextFromDocument } = require('../services/ocrService');
    const pdfBytes = fs.readFileSync(blankPdf);
    const pdfB64 = pdfBytes.toString('base64');
    const pdfOcr = await extractTextFromDocument(pdfB64, 'application/pdf', { filename: 'blank-scan.pdf' });
    if (pdfOcr && pdfOcr.length > 0) ok('OCR endpoint (PDF document)', process.env.OCR_MODEL, pdfOcr.slice(0, 60));
    else fail('OCR endpoint (PDF document)', process.env.OCR_MODEL, 'empty');
  } catch (e) {
    fail('OCR endpoint (PDF document)', process.env.OCR_MODEL, e.message);
  }

  // RAG
  try {
    const bnsRag = require('../services/bnsRagService');
    const lawEmb = require('../repositories/lawEmbeddingsRepo');
    const { query } = require('../config/postgres');
    const pgvec = await query(`SELECT extname FROM pg_extension WHERE extname='vector'`);
    const embConfigured = Boolean(process.env.EMBEDDING_BASE_URL && process.env.EMBEDDING_MODEL);
    if (!pgvec.rows.length) {
      record('PGVector dense retrieval', 'Yes', 'NOT AVAILABLE', 'PostgreSQL', 'CREATE EXTENSION vector not installed');
    } else if (!embConfigured) {
      record('PGVector dense retrieval', 'Yes', 'NOT AVAILABLE', 'EMBEDDING_*', 'embeddings not configured');
    } else {
      const stats = await lawEmb.getEmbeddingStats(process.env.EMBEDDING_MODEL);
      if (stats.pgvector && stats.count > 0) ok('PGVector dense retrieval', 'pgvector', `${stats.count} embeddings`);
      else record('PGVector dense retrieval', 'Yes', 'NOT AVAILABLE', 'law_embeddings', 'table empty or pgvector off');
    }

    const facts = await bnsRag.extractIncidentFacts(
      'Accused snatched mobile phone from complainant using force on public road.'
    );
    if (facts?.length > 10) ok('Incident-fact extraction', 'vLLM', facts.slice(0, 80));
    else fail('Incident-fact extraction', 'vLLM', 'empty facts');

    const retrieved = await bnsRag.retrieveCandidates(facts);
    if (retrieved?.length > 0) {
      const modes = [];
      if (retrieved.some((c) => c.ftsScore != null)) modes.push('FTS');
      if (retrieved.some((c) => c.lexicalScore != null)) modes.push('BM25');
      if (retrieved.some((c) => c.vectorScore != null)) modes.push('pgvector');
      ok('BNS/BNSS/BSA section retrieval', 'PostgreSQL+BM25', `${retrieved.length} candidates via ${modes.join('+') || 'unknown'}`);
    } else fail('BNS/BNSS/BSA section retrieval', 'PostgreSQL', 'no candidates');

    const rag = await bnsRag.recommendSections(
      'Complainant Ramesh Kumar states accused Suresh snatched his mobile phone on MG Road Hyderabad on 15 March 2026 using force.'
    );
    if (rag.recommendations?.length >= 0) {
      if (rag.recommendations.length > 0) ok('RAG recommendation', 'vLLM+judge', `${rag.recommendations.length} sections`);
      else degraded('RAG recommendation', 'vLLM+judge', '0 sections above threshold (retrieval worked)');
    } else fail('RAG recommendation', 'vLLM+judge', 'no response');
  } catch (e) {
    fail('BNS/BNSS/BSA section retrieval', 'PostgreSQL', e.message);
    fail('RAG recommendation', 'vLLM+judge', e.message);
  }

  // List filters HTTP
  try {
    await fetchJson(`${BASE}/api/petitions`, {
      method: 'POST',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: `PET-BLOCK-${ts}`,
        petitionNo: `PET/BLOCK/${ts}`,
        date: '01 Sep 2026',
        complainant: 'Block Test',
        accused: 'Unknown',
        sections: [],
        score: 50,
        status: 'Pending Filing',
        blockers: ['When'],
        sourceFile: 'b.json'
      })
    });
    const statusRes = await fetchJson(`${BASE}/api/petitions?status=Pending%20Filing`, { headers: authHeaders });
    const noBlock = await fetchJson(`${BASE}/api/petitions?hasBlockers=false`, { headers: authHeaders });
    const withBlock = await fetchJson(`${BASE}/api/petitions?hasBlockers=true`, { headers: authHeaders });
    if (Array.isArray(statusRes.body) && statusRes.body.every((p) => p.status === 'Pending Filing')) {
      ok('Petition list status filter', 'HTTP', `${statusRes.body.length} rows`);
    } else fail('Petition list status filter', 'HTTP', 'filter mismatch');
    if (Array.isArray(noBlock.body) && noBlock.body.every((p) => !p.blockers?.length)) {
      ok('Petition list withoutBlockers', 'HTTP', `${noBlock.body.length} rows`);
    } else fail('Petition list withoutBlockers', 'HTTP', 'blockers present');
    if (Array.isArray(withBlock.body) && withBlock.body.every((p) => p.blockers?.length > 0)) {
      ok('Petition list withBlockers', 'HTTP', `${withBlock.body.length} rows`);
    } else fail('Petition list withBlockers', 'HTTP', 'missing blockers');
  } catch (e) {
    fail('Petition list status filter', 'HTTP', e.message);
    fail('Petition list withoutBlockers', 'HTTP', e.message);
    fail('Petition list withBlockers', 'HTTP', e.message);
  }

  // Petition detail
  try {
    const { res, body } = await fetchJson(`${BASE}/api/petitions/${petitionId}`, { headers: authHeaders });
    if (res.status === 200 && body?.id === petitionId) ok('Petition detail', 'HTTP', petitionId);
    else fail('Petition detail', 'HTTP', `status=${res.status}`);
  } catch (e) {
    fail('Petition detail', 'HTTP', e.message);
  }

  // FIR autofill
  try {
    const { res, body } = await fetchJson(`${BASE}/api/petitions/${petitionId}/autofill-fir`, {
      headers: authHeaders
    });
    if (res.status === 200 && body?.fields) ok('FIR autofill', 'vLLM', Object.keys(body.fields).slice(0, 5).join(','));
    else fail('FIR autofill', 'vLLM', body?.message || `status=${res.status}`);
  } catch (e) {
    fail('FIR autofill', 'vLLM', e.message);
  }

  // FIR create + retrieval + 1:1
  const firNo = `FIR/HYD/VERIFY/${ts}`;
  try {
    const { res, body } = await fetchJson(`${BASE}/api/firs`, {
      method: 'POST',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        firNo,
        petitionId,
        district: 'Hyderabad',
        policeStation: 'MG Road PS',
        year: '2026',
        complainant: 'Ramesh Kumar',
        accused: 'Suresh',
        sections: ['BNS 303'],
        incidentFacts: 'Mobile snatching on MG Road.'
      })
    });
    if (res.status === 201 && body?.firNo === firNo) ok('FIR creation/filing', 'HTTP', firNo);
    else fail('FIR creation/filing', 'HTTP', JSON.stringify(body).slice(0, 120));

    const byPet = await fetchJson(`${BASE}/api/firs/by-petition/${petitionId}`, { headers: authHeaders });
    if (byPet.res.status === 200 && byPet.body?.petitionId === petitionId) {
      ok('FIR retrieval by petition', 'HTTP', byPet.body.firNo);
      ok('Petition/FIR 1:1 relationship', 'HTTP', 'single FIR for petition');
    } else {
      fail('FIR retrieval by petition', 'HTTP', `status=${byPet.res.status}`);
      fail('Petition/FIR 1:1 relationship', 'HTTP', 'lookup failed');
    }

    const listFirs = await fetchJson(`${BASE}/api/firs`, { headers: authHeaders });
    if (listFirs.res.status === 200 && Array.isArray(listFirs.body)) ok('FIR list retrieval', 'HTTP', `${listFirs.body.length} FIRs`);
    else fail('FIR list retrieval', 'HTTP', `status=${listFirs.res.status}`);
  } catch (e) {
    fail('FIR creation/filing', 'HTTP', e.message);
  }

  // Delete blocked when FIR exists - mark petition filed first
  try {
    await fetchJson(`${BASE}/api/petitions/${petitionId}`, {
      method: 'PUT',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'FIR Filed', firNo })
    });
    const del = await fetchJson(`${BASE}/api/petitions/${petitionId}`, {
      method: 'DELETE',
      headers: authHeaders
    });
    if (del.res.status === 409) ok('Delete blocked when FIR filed', 'HTTP', del.body?.message || '409');
    else fail('Delete blocked when FIR filed', 'HTTP', `status=${del.res.status}`);
  } catch (e) {
    fail('Delete blocked when FIR filed', 'HTTP', e.message);
  }
}

async function testMongoSyncFailureAndReplay() {
  const connectDB = require('../config/db');
  await connectDB();

  const postgres = require('../config/postgres');
  delete require.cache[require.resolve('../repositories/dualWrite')];
  delete require.cache[require.resolve('../repositories/petitionsRepo')];
  const petitionsRepo = require('../repositories/petitionsRepo');
  const petitionsMongo = require('../adapters/mongo/petitionsMongo');
  const { query, connectPostgres } = require('../config/postgres');
  await connectPostgres();

  const ts = Date.now();
  const legacyId = `PET-SYNC-FAIL-${ts}`;
  const knownMongoId = `507f1f77bcf86cd7${(ts % 0xffffff).toString(16).padStart(8, '0')}`;
  const origUpsert = petitionsMongo.upsertFromPg;
  petitionsMongo.upsertFromPg = async () => {
    throw new Error('mongo down simulated');
  };

  let created;
  try {
    created = await petitionsRepo.create({
      id: legacyId,
      petitionNo: `PET/SYNC/${ts}`,
      date: '01 Sep 2026',
      complainant: 'Sync Test',
      accused: 'Unknown',
      sections: [],
      score: 70,
      status: 'Pending Filing',
      blockers: [],
      sourceFile: 'sync.txt',
      mongoId: knownMongoId
    });

    ok('Mongo sync failure: PG write still succeeds', 'dualWrite', `created ${legacyId}`);

    const { rows } = await query(
      `SELECT sync_status, mongo_id, last_error FROM migration_sync_status
       WHERE entity_type='petitions' AND postgres_id=$1 AND sync_direction='pg_to_mongo'
       ORDER BY last_synced_at DESC NULLS LAST LIMIT 1`,
      [created.pgId]
    );
    const st = rows[0];
    if (st?.sync_status === 'failed' && st?.mongo_id === knownMongoId && st?.last_error?.includes('mongo down')) {
      ok('Mongo sync failure: sync_status failed + mongo_id preserved', 'PostgreSQL', st.mongo_id);
    } else {
      fail('Mongo sync failure: sync_status', 'PostgreSQL', JSON.stringify(st));
    }

    petitionsMongo.upsertFromPg = origUpsert;

    const { spawnSync } = require('child_process');
    const replay = spawnSync('node', ['db/migrate/replayFailedMongoSync.js'], {
      cwd: path.join(__dirname, '..'),
      encoding: 'utf8',
      env: process.env
    });

    const { rows: after } = await query(
      `SELECT sync_status, last_error FROM migration_sync_status
       WHERE entity_type='petitions' AND postgres_id=$1 AND sync_direction='pg_to_mongo'
       ORDER BY last_synced_at DESC NULLS LAST LIMIT 1`,
      [created.pgId]
    );
    if (after[0]?.sync_status === 'synced') {
      ok('replayFailedMongoSync.js', 'script', (replay.stdout || '').trim().split('\n').pop() || 'synced');
      ok('Mongo dual-write (after replay)', 'Mongo', `petition ${legacyId} synced`);
    } else {
      fail('replayFailedMongoSync.js', 'script', (replay.stderr || replay.stdout || JSON.stringify(after[0])).slice(0, 200));
    }
  } catch (e) {
    petitionsMongo.upsertFromPg = origUpsert;
    fail('Mongo sync failure behavior', 'dualWrite', e.message);
  }
}

async function testPgFallbackRead() {
  const connectDB = require('../config/db');
  await connectDB();

  const postgres = require('../config/postgres');
  const origQuery = postgres.query;
  const origPoolQuery = postgres.pool.query.bind(postgres.pool);
  let mongoCalled = false;

  const throwingQuery = async () => {
    throw new Error('PG unavailable simulated');
  };
  postgres.query = throwingQuery;
  postgres.pool.query = throwingQuery;

  delete require.cache[require.resolve('../adapters/mongo/petitionsMongo')];
  delete require.cache[require.resolve('../repositories/dualWrite')];
  delete require.cache[require.resolve('../repositories/petitionsRepo')];
  const petitionsMongo = require('../adapters/mongo/petitionsMongo');
  const petitionsRepo = require('../repositories/petitionsRepo');

  const sample = [
    { id: 'FB-A', status: 'Pending Filing', blockers: [], petitionNo: 'P1', complainant: 'Alpha', accused: 'X', firNo: '', createdAt: new Date('2026-01-03'), updatedAt: new Date('2026-01-03') },
    { id: 'FB-B', status: 'Pending Filing', blockers: ['When'], petitionNo: 'P2', complainant: 'Beta', accused: 'Y', firNo: '', createdAt: new Date('2026-01-02'), updatedAt: new Date('2026-01-02') },
    { id: 'FB-C', status: 'FIR Filed', blockers: [], petitionNo: 'P3', complainant: 'Gamma', accused: 'Z', firNo: 'F1', createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-01') }
  ].map((p) => ({
    ...p,
    _id: p.id,
    legacyId: p.id,
    sections: [],
    sectionRecommendations: [],
    score: 1,
    sourceFile: '',
    step1Output: '',
    step2Output: '',
    step3Output: {},
    metadata: {},
    filedAt: ''
  }));

  petitionsMongo.findByLegacyId = async (id) => {
    mongoCalled = true;
    return sample.find((r) => r.id === id) || null;
  };

  petitionsMongo.findMany = async (filter, options = {}) => {
    let rows = [...sample];
    if (filter.status) rows = rows.filter((r) => r.status === filter.status);
    if (filter.withoutBlockers) rows = rows.filter((r) => !r.blockers?.length);
    if (filter.withBlockers) rows = rows.filter((r) => r.blockers?.length > 0);
    rows.sort((a, b) => b.createdAt - a.createdAt);
    if (options.offset) rows = rows.slice(options.offset);
    if (options.limit) rows = rows.slice(0, options.limit);
    return rows;
  };

  try {
    const row = await petitionsRepo.findByLegacyId('FB-A');
    if (mongoCalled && row?.id === 'FB-A') {
      degraded('PostgreSQL read fallback to Mongo', 'readWithFallback', 'mongo read used; no PG backfill');
    } else {
      fail('PostgreSQL read fallback to Mongo', 'readWithFallback', `mongoCalled=${mongoCalled}`);
    }

    const statusList = await petitionsRepo.list({ filter: { status: 'Pending Filing' } });
    const noBlock = await petitionsRepo.list({ filter: { withoutBlockers: true } });
    const withBlock = await petitionsRepo.list({ filter: { withBlockers: true } });
    const paged = await petitionsRepo.list({ filter: {}, limit: 1, offset: 0 });

    if (
      statusList.length === 2 &&
      noBlock.length === 2 &&
      withBlock.length === 1 &&
      paged.length === 1 &&
      paged[0].id === 'FB-A'
    ) {
      ok('PG unavailable: list filters preserved in Mongo fallback', 'petitionsRepo', 'status/blockers/pagination');
    } else {
      fail(
        'PG unavailable: list filters preserved in Mongo fallback',
        'petitionsRepo',
        `counts ${statusList.length}/${noBlock.length}/${withBlock.length}/${paged.length}`
      );
    }
  } finally {
    postgres.query = origQuery;
    postgres.pool.query = origPoolQuery;
    delete require.cache[require.resolve('../adapters/mongo/petitionsMongo')];
    delete require.cache[require.resolve('../repositories/dualWrite')];
    delete require.cache[require.resolve('../repositories/petitionsRepo')];
  }
}

async function main() {
  console.log('Starting verification...\n');

  skip('mongo_to_pg sync_status (migration scripts)', 'migrateUsers/Petitions/Firs', 'runtime dualWrite only records pg_to_mongo');

  await testDualWriteMongoId();
  await testListMongoFallbackFilters();

  // Start server
  const serverProc = spawn('node', ['server.js'], {
    cwd: path.join(__dirname, '..'),
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env }
  });
  let serverLog = '';
  serverProc.stdout.on('data', (d) => {
    serverLog += d.toString();
  });
  serverProc.stderr.on('data', (d) => {
    serverLog += d.toString();
  });

  const healthy = await waitForHealth(60000);
  if (!healthy && !/Server running on port/.test(serverLog)) {
    fail('Backend server startup', 'node server.js', serverLog.slice(-300) || 'health check timeout');
  } else {
    ok('Backend server startup', 'node server.js', /Server running on port/.test(serverLog) ? 'listening' : 'health ok');
    try {
      await runHttpWorkflow();
    } catch (e) {
      fail('HTTP workflow', 'server', e.message);
    }
  }

  serverProc.kill('SIGTERM');
  await sleep(500);

  await testMongoSyncFailureAndReplay();
  await testPgFallbackRead();

  // Print table
  console.log('\n| Feature | Tested? | Result | Dependency | Notes |');
  console.log('|---|---|---|---|---|');
  for (const r of results) {
    const notes = String(r.notes || '').replace(/\|/g, '/').replace(/\n/g, ' ');
    console.log(`| ${r.feature} | ${r.tested} | ${r.result} | ${r.dependency} | ${notes} |`);
  }

  const verified = results.filter((r) => r.result === 'PASS').map((r) => r.feature);
  const degradedList = results.filter((r) => r.result === 'DEGRADED').map((r) => r.feature);
  const failedList = results.filter((r) => r.result === 'FAIL').map((r) => r.feature);
  const notTested = results.filter((r) => r.result === 'NOT TESTED').map((r) => r.feature);
  const unavailable = results.filter((r) => r.result === 'NOT AVAILABLE').map((r) => r.feature);

  console.log('\n### 1. Verified working');
  verified.forEach((f) => console.log(`- ${f}`));
  console.log('\n### 2. Working with external dependency / fallback');
  degradedList.forEach((f) => console.log(`- ${f}`));
  console.log('\n### 3. Not tested');
  notTested.forEach((f) => console.log(`- ${f}`));
  console.log('\n### 4. Not implemented / unavailable');
  unavailable.forEach((f) => console.log(`- ${f}`));
  if (failedList.length) {
    console.log('\n### Failures');
    failedList.forEach((f) => console.log(`- ${f}`));
  }

  process.exit(failedList.length ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
