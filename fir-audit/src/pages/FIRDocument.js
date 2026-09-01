import { useState, useEffect } from 'react';
import { useParams, useNavigate, useOutletContext } from 'react-router-dom';
import FIRButton from '../components/reusable/FIRButton';
import FIRCard from '../components/reusable/FIRCard';
import SectionSelector from '../components/reusable/SectionSelector';
import { getPetitionById, updatePetition, createFir, getFirByPetitionId, autofillFir } from '../api/petition';

const blankAccused = () => ({
  name: '',
  relative: '',
  occupation: '',
  caste: '',
  gender: '',
  age: '',
  nationality: '',
  houseNo: '',
  street: '',
  area: '',
  city: '',
  state: '',
  pin: '',
  phoneOff: '',
  phoneResi: '',
  cellNo: '',
  email: '',
  dob: '',
  build: '',
  height: '',
  complexion: '',
  idMarks: '',
  deformities: '',
  teeth: '',
  hair: '',
  eyes: '',
  habits: '',
  dressHabits: '',
  languages: '',
  burnMark: '',
  leucoderma: '',
  mole: '',
  scar: '',
  tattoo: ''
});

export default function FIRDocument() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { dark } = useOutletContext();
  const [loading, setLoading] = useState(true);
  const [petition, setPetition] = useState(null);

  // 15 Section states
  const [formData, setFormData] = useState({
    district: '',
    policeStation: '',
    year: '',
    firNo: '',
    firDate: '',
    firTime: '',
    occurrenceDay: '',
    occurrenceDateFrom: '',
    occurrenceTimeFrom: '',
    occurrenceDateTo: '',
    occurrenceTimeTo: '',
    priorToTimePeriod: '',
    receivedDate: '',
    receivedTime: '',
    gdEntryNo: '',
    gdDateTime: '',
    typeOfInformation: '',
    distanceDirection: '',
    beatNo: '',
    occurrenceAddress: '',
    outsideLimitPSName: '',
    outsideLimitDistrict: '',
    complainantName: '',
    complainantRelative: '',
    complainantDob: '',
    complainantAge: '',
    complainantNationality: '',
    complainantCaste: '',
    complainantPassport: '',
    complainantPassportIssueDate: '',
    complainantPassportIssuePlace: '',
    complainantOccupation: '',
    complainantMobile: '',
    complainantAddress: '',
    reasonsForDelay: '',
    propertiesStolen: '',
    totalValueStolen: '',
    inquestReport: '',
    incidentFacts: '',
    actionTaken: '',
    dispatchDateTime: '',
    officerName: '',
    officerRank: '',
    officerNo: ''
  });

  const [modalSections, setModalSections] = useState([]);
  const [accusedList, setAccusedList] = useState([]);

  useEffect(() => {
    const fetchPetition = async () => {
      try {
        const p = await getPetitionById(id);
        setPetition(p);

        // Parse sections
        setModalSections(p.sections || []);

        // Pre-fill administrative "today" fields (filing/receipt timestamps — a fact
        // about when this FIR is being processed, not a fact being extracted from the
        // petition, so defaulting these to now is legitimate, not invented data).
        const currentYear = new Date().getFullYear().toString();
        const currentDateStr = new Date().toISOString().substring(0, 10);
        const currentTimeStr = new Date().toTimeString().substring(0, 8);

        let firData = {};
        if (p.status === 'FIR Filed') {
          try {
            firData = await getFirByPetitionId(p.id);
          } catch (e) {
            console.error('Failed to fetch FIR data for petition:', e);
          }
        }

        // AI FIR field extraction — runs only while drafting (an already-filed
        // FIR's own record above is authoritative, so skip the call there to
        // save a redundant LLM round trip). Reads the officer-VERIFIED petition
        // text (step2Output — approved through the pipeline's review steps, not
        // the raw unverified OCR), and is cached server-side after first run.
        // See backend/services/firAutofillService.js for the extraction schema.
        let autofill = {};
        if (p.status !== 'FIR Filed') {
          try {
            const result = await autofillFir(p.id);
            autofill = result?.fields || {};
          } catch (e) {
            console.error('FIR autofill extraction failed:', e);
          }
        }

        // Accused: prefer the already-filed FIR record, then AI-extracted
        // accused details, then fall back to splitting the coarse Step 1
        // complainant/accused names if neither is available.
        let mappedAccused = [];
        if (p.status === 'FIR Filed' && firData.accusedList?.length > 0) {
          mappedAccused = firData.accusedList;
        } else if (autofill.accusedList?.length > 0) {
          mappedAccused = autofill.accusedList.map((a) => ({ ...blankAccused(), ...a }));
        } else if (p.accused) {
          const names = p.accused.split(/\s+and\s+|\s*,\s*/i);
          mappedAccused = names.map((name) => ({ ...blankAccused(), name: name.trim() }));
        } else {
          mappedAccused = [blankAccused()];
        }
        setAccusedList(mappedAccused);

        const fullDocumentText = p.step2Output || p.step1Output || '';

        setFormData({
          district: firData.district || '',
          policeStation: firData.policeStation || '',
          year: firData.year || currentYear,
          firNo: firData.firNo || p.firNo || '',
          firDate: firData.firDate || currentDateStr,
          firTime: firData.firTime || currentTimeStr,
          occurrenceDay: firData.occurrenceDay || autofill.occurrenceDay || '',
          occurrenceDateFrom: firData.occurrenceDateFrom || autofill.occurrenceDateFrom || '',
          occurrenceTimeFrom: firData.occurrenceTimeFrom || autofill.occurrenceTimeFrom || '',
          occurrenceDateTo: firData.occurrenceDateTo || autofill.occurrenceDateTo || '',
          occurrenceTimeTo: firData.occurrenceTimeTo || autofill.occurrenceTimeTo || '',
          priorToTimePeriod: firData.priorToTimePeriod || '',
          receivedDate: firData.receivedDate || (p.date && p.date !== 'Just now' && p.date !== 'Yesterday' ? p.date : currentDateStr),
          receivedTime: firData.receivedTime || currentTimeStr,
          gdEntryNo: firData.gdEntryNo || '',
          gdDateTime: firData.gdDateTime || '',
          typeOfInformation: firData.typeOfInformation || 'Written',
          distanceDirection: firData.distanceDirection || '',
          beatNo: firData.beatNo || '',
          occurrenceAddress: firData.occurrenceAddress || autofill.occurrenceAddress || p.occurrencePlace || '',
          outsideLimitPSName: firData.outsideLimitPSName || '',
          outsideLimitDistrict: firData.outsideLimitDistrict || '',
          complainantName: firData.complainant || autofill.complainantName || p.complainant || '',
          complainantRelative: firData.complainantRelative || autofill.complainantRelative || '',
          complainantDob: firData.complainantDob || autofill.complainantDob || '',
          complainantAge: firData.complainantAge || autofill.complainantAge || '',
          complainantNationality: firData.complainantNationality || autofill.complainantNationality || '',
          complainantCaste: firData.complainantCaste || autofill.complainantCaste || '',
          complainantPassport: firData.complainantPassport || autofill.complainantPassport || '',
          complainantPassportIssueDate: firData.complainantPassportIssueDate || autofill.complainantPassportIssueDate || '',
          complainantPassportIssuePlace: firData.complainantPassportIssuePlace || autofill.complainantPassportIssuePlace || '',
          complainantOccupation: firData.complainantOccupation || autofill.complainantOccupation || '',
          complainantMobile: firData.complainantPhone || autofill.complainantMobile || '',
          complainantAddress: firData.complainantAddress || autofill.complainantAddress || '',
          reasonsForDelay: firData.reasonsForDelay || autofill.reasonsForDelay || '',
          propertiesStolen: firData.propertiesStolen || autofill.propertiesStolen || '',
          totalValueStolen: firData.totalValueStolen || autofill.totalValueStolen || '',
          inquestReport: firData.inquestReport || '',
          // Full translated petition text (falls back to raw OCR if translation is
          // unavailable) — not an AI-generated summary, the complete document as scanned.
          incidentFacts: firData.incidentFacts || fullDocumentText,
          actionTaken: firData.actionTaken || '',
          refusedInvestigationDueTo: firData.refusedInvestigationDueTo || '',
          transferredPS: firData.transferredPS || '',
          transferredDistrict: firData.transferredDistrict || '',
          dispatchDateTime: firData.dispatchDateTime || '',
          officerName: firData.officerName || '',
          officerRank: firData.officerRank || '',
          officerNo: firData.officerNo || ''
        });
      } catch (err) {
        console.error('Error fetching petition details:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchPetition();
  }, [id]);

  const updateField = (field, val) => {
    setFormData(prev => ({
      ...prev,
      [field]: val
    }));
  };

  const handleAccusedChange = (index, field, value) => {
    const updated = [...accusedList];
    updated[index][field] = value;
    setAccusedList(updated);
  };

  const addAccused = () => {
    setAccusedList(prev => [...prev, blankAccused()]);
  };

  const removeAccused = (index) => {
    if (accusedList.length === 1) return;
    setAccusedList(prev => prev.filter((_, i) => i !== index));
  };

  const handleRegisterAndFile = async () => {
    if (!petition) return;

    const newFirNumber = formData.firNo || `FIR/HYD/2026/${Math.floor(100 + Math.random() * 900)}`;

    const updatedPet = {
      ...petition,
      complainant: formData.complainantName,
      accused: accusedList.map(a => a.name).join(', '),
      sections: modalSections,
      status: 'FIR Filed',
      firNo: newFirNumber,
      filedAt: new Date().toLocaleString(),
      district: formData.district,
      policeStation: formData.policeStation,
      gdNumber: formData.gdEntryNo,
      incidentDate: formData.occurrenceDateFrom,
      incidentTime: formData.occurrenceTimeFrom,
      occurrencePlace: formData.occurrenceAddress,
      complainantRelative: formData.complainantRelative,
      complainantPhone: formData.complainantMobile,
      complainantAddress: formData.complainantAddress,
      incidentFacts: formData.incidentFacts,
      blockers: [] // Clear blockers when filed
    };

    const firRecord = {
      // Core
      firNo: newFirNumber,
      petitionId: petition.id,
      filedAt: new Date().toLocaleString(),

      // Section 1
      district:       formData.district,
      policeStation:  formData.policeStation,
      year:           formData.year,
      firDate:        formData.firDate,
      firTime:        formData.firTime,

      // Section 2
      sections: modalSections,

      // Section 3
      occurrenceDay:      formData.occurrenceDay,
      occurrenceDateFrom: formData.occurrenceDateFrom,
      occurrenceTimeFrom: formData.occurrenceTimeFrom,
      occurrenceDateTo:   formData.occurrenceDateTo,
      occurrenceTimeTo:   formData.occurrenceTimeTo,
      priorToTimePeriod:  formData.priorToTimePeriod,
      receivedDate:       formData.receivedDate,
      receivedTime:       formData.receivedTime,
      gdEntryNo:          formData.gdEntryNo,
      gdDateTime:         formData.gdDateTime,

      // Section 4
      typeOfInformation: formData.typeOfInformation,

      // Section 5
      distanceDirection:    formData.distanceDirection,
      beatNo:               formData.beatNo,
      occurrenceAddress:    formData.occurrenceAddress,
      outsideLimitPSName:   formData.outsideLimitPSName,
      outsideLimitDistrict: formData.outsideLimitDistrict,

      // Section 6
      complainant:                   formData.complainantName,
      complainantRelative:           formData.complainantRelative,
      complainantDob:                formData.complainantDob,
      complainantAge:                formData.complainantAge,
      complainantNationality:        formData.complainantNationality,
      complainantCaste:              formData.complainantCaste,
      complainantPassport:           formData.complainantPassport,
      complainantPassportIssueDate:  formData.complainantPassportIssueDate,
      complainantPassportIssuePlace: formData.complainantPassportIssuePlace,
      complainantOccupation:         formData.complainantOccupation,
      complainantPhone:              formData.complainantMobile,
      complainantAddress:            formData.complainantAddress,

      // Section 7
      accused:     accusedList.map(a => a.name).join(', '),
      accusedList: accusedList,

      // Section 8
      reasonsForDelay: formData.reasonsForDelay,

      // Section 9 & 10
      propertiesStolen: formData.propertiesStolen,
      totalValueStolen: formData.totalValueStolen,

      // Section 11
      inquestReport: formData.inquestReport,

      // Section 12
      incidentFacts: formData.incidentFacts,

      // Section 13
      actionTaken:               formData.actionTaken,
      refusedInvestigationDueTo: formData.refusedInvestigationDueTo,
      transferredPS:             formData.transferredPS,
      transferredDistrict:       formData.transferredDistrict,

      // Section 14
      officerName: formData.officerName,
      officerRank: formData.officerRank,
      officerNo:   formData.officerNo,

      // Section 15
      dispatchDateTime: formData.dispatchDateTime
    };

    try {
      await createFir(firRecord);
      await updatePetition(petition.id, updatedPet);
      setPetition(updatedPet);
      alert('FIR Registered and Filed successfully!');
    } catch (err) {
      console.error('Failed to register FIR:', err);
      alert('Registration failed: ' + err.message);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <span className="w-8 h-8 rounded-full border-4 border-blue-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  const isFiled = petition?.status === 'FIR Filed';

  return (
    <div className="space-y-6">

      {/* Dynamic styling block for print layout */}
      <style dangerouslySetInnerHTML={{
        __html: `
        .print-watermark, .print-header {
          display: none;
        }
        @media print {
          .print-watermark {
            display: block !important;
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            opacity: 0.15;
            pointer-events: none;
            z-index: 0;
            width: 80%;
            max-width: 600px;
          }
          .print-header {
            display: block !important;
            position: fixed;
            top: 0;
            right: 0;
            padding: 10px 20px;
            font-size: 14px;
            font-weight: bold;
            color: #2563eb !important;
            z-index: 100;
          }
          * {
            overflow: visible !important;
            max-height: none !important;
          }
          html, body, #root {
            height: auto !important;
            overflow: visible !important;
            background: white !important;
          }
          aside, header, nav, .no-print, .print-btn-bar {
            display: none !important;
          }
          main {
            padding: 0 !important;
            margin: 0 !important;
            background: white !important;
            color: black !important;
            height: auto !important;
          }
          .main-content-wrapper, .space-y-6 {
            padding: 0 !important;
            margin: 0 !important;
            height: auto !important;
            overflow: visible !important;
          }
          .print-full-page {
            border: none !important;
            box-shadow: none !important;
            width: 100% !important;
            max-width: 100% !important;
            background: white !important;
            color: black !important;
            padding: 0 !important;
          }
          table, tr, td, th {
            border-color: #000000 !important;
            color: #000000 !important;
          }
          input, textarea, select {
            border: none !important;
            background: transparent !important;
            appearance: none !important;
            padding: 0 !important;
            margin: 0 !important;
            font-weight: bold !important;
            color: black !important;
            resize: none !important;
          }
        }
      `}} />

      {/* Button Action Bar */}
      <div className="flex flex-wrap justify-between items-center gap-2 no-print">
        <div className="flex gap-2">
          <FIRButton onClick={() => navigate(-1)} variant="secondary" dark={dark}>
            ← Back
          </FIRButton>
        </div>
        <div className="flex gap-2.5">
          {!isFiled && (
            <FIRButton onClick={handleRegisterAndFile} variant="primary">
              📂 Register &amp; File FIR
            </FIRButton>
          )}
          {isFiled && (
            <FIRButton onClick={handlePrint} variant="solid" className="bg-blue-600 hover:bg-blue-700 text-white">
              🖨️ Print FIR
            </FIRButton>
          )}
        </div>
      </div>

      {/* Document layout container */}
      <FIRCard dark={dark} noPadding className="p-4 sm:p-6 md:p-8 w-full shadow-2xl border print-full-page bg-white text-black border-black/15 relative z-10 pt-16">

        {/* Top Right Header (visible only on print) */}
        <div className="print-header">FIRAudit.ai</div>

        {/* Watermark Logo (visible only on print) */}
        <img src="/bluecloud-logo-colored.png" alt="Blue Cloud Softech Solutions" className="print-watermark" />

        {/* Document Header */}
        <div className="text-center space-y-1.5 border-b-2 border-black pb-5 mb-6">
          <h1 className="text-xl font-bold tracking-tight uppercase">First Information Report</h1>
          <p className="text-[11px] font-bold tracking-wider uppercase">T.S.P.M. Orders 470, 500</p>
          <p className="text-xs font-semibold">(Under Section 173 and 176 BNSS)</p>
        </div>

        {/* 15 Sections Form Grid */}
        <div className="space-y-5 text-[11px] leading-relaxed">

          {/* Section 1 */}
          <div className="border border-black p-3">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
              <div>
                <span className="font-bold block mb-1">1. District</span>
                {isFiled ? (
                  <span className="font-semibold">{formData.district}</span>
                ) : (
                  <input
                    type="text"
                    value={formData.district}
                    onChange={(e) => updateField('district', e.target.value)}
                    className="w-full bg-black/5 px-2 py-1 rounded focus:outline-none"
                  />
                )}
              </div>
              <div>
                <span className="font-bold block mb-1">P.S.</span>
                {isFiled ? (
                  <span className="font-semibold">{formData.policeStation}</span>
                ) : (
                  <input
                    type="text"
                    value={formData.policeStation}
                    onChange={(e) => updateField('policeStation', e.target.value)}
                    className="w-full bg-black/5 px-2 py-1 rounded focus:outline-none"
                  />
                )}
              </div>
              <div>
                <span className="font-bold block mb-1">Year</span>
                {isFiled ? (
                  <span className="font-semibold">{formData.year}</span>
                ) : (
                  <input
                    type="text"
                    value={formData.year}
                    onChange={(e) => updateField('year', e.target.value)}
                    className="w-full bg-black/5 px-2 py-1 rounded focus:outline-none"
                  />
                )}
              </div>
              <div>
                <span className="font-bold block mb-1">FIR No.</span>
                {isFiled ? (
                  <span className="font-bold text-red-600">{formData.firNo}</span>
                ) : (
                  <input
                    type="text"
                    value={formData.firNo}
                    onChange={(e) => updateField('firNo', e.target.value)}
                    className="w-full bg-black/5 px-2 py-1 rounded focus:outline-none font-bold"
                    placeholder="e.g. 109/2025"
                  />
                )}
              </div>
              <div>
                <span className="font-bold block mb-1">Date</span>
                {isFiled ? (
                  <span className="font-semibold">{formData.firDate} {formData.firTime}</span>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    <input
                      type="date"
                      value={formData.firDate}
                      onChange={(e) => updateField('firDate', e.target.value)}
                      className="flex-1 min-w-0 bg-black/5 px-1 py-1 rounded focus:outline-none"
                    />
                    <input
                      type="time"
                      value={formData.firTime}
                      onChange={(e) => updateField('firTime', e.target.value)}
                      className="flex-1 min-w-0 bg-black/5 px-1 py-1 rounded focus:outline-none"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Section 2 */}
          <div className="border border-black p-3 space-y-2">
            <span className="font-bold block">2. Acts &amp; Section(s):</span>
            {isFiled ? (
              <div className="flex flex-wrap gap-1">
                {modalSections.map((sec) => (
                  <span key={sec} className="bg-gray-100 border border-gray-300 px-2 py-0.5 rounded text-[10px] font-mono font-bold">
                    {sec}
                  </span>
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                <SectionSelector
                  dark={false}
                  sections={modalSections}
                  onChange={setModalSections}
                  recommendedSections={petition?.sections || []}
                  petitionId={petition?.id || id}
                  blockers={petition?.blockers || []}
                />
              </div>
            )}
          </div>

          {/* Section 3 */}
          <div className="border border-black p-3 space-y-3">
            <span className="font-bold block">3. Occurrence of Offence:</span>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pl-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 lg:border-r border-black/10 lg:pr-4">
                <div className="col-span-2 font-bold mb-1">a) Occurrence of Offence details:</div>
                <div>
                  <span className="opacity-70 block">Day</span>
                  {isFiled ? (
                    <span className="font-semibold">{formData.occurrenceDay}</span>
                  ) : (
                    <input
                      type="text"
                      value={formData.occurrenceDay}
                      onChange={(e) => updateField('occurrenceDay', e.target.value)}
                      className="w-full bg-black/5 px-2 py-0.5 rounded focus:outline-none"
                    />
                  )}
                </div>
                <div>
                  <span className="opacity-70 block">Prior To Period</span>
                  {isFiled ? (
                    <span className="font-semibold">{formData.priorToTimePeriod}</span>
                  ) : (
                    <input
                      type="text"
                      value={formData.priorToTimePeriod}
                      onChange={(e) => updateField('priorToTimePeriod', e.target.value)}
                      className="w-full bg-black/5 px-2 py-0.5 rounded focus:outline-none"
                    />
                  )}
                </div>
                <div>
                  <span className="opacity-70 block">Date From</span>
                  {isFiled ? (
                    <span className="font-semibold">{formData.occurrenceDateFrom}</span>
                  ) : (
                    <input
                      type="date"
                      value={formData.occurrenceDateFrom}
                      onChange={(e) => updateField('occurrenceDateFrom', e.target.value)}
                      className="w-full min-w-0 bg-black/5 px-2 py-0.5 rounded focus:outline-none"
                    />
                  )}
                </div>
                <div>
                  <span className="opacity-70 block">Time From</span>
                  {isFiled ? (
                    <span className="font-semibold">{formData.occurrenceTimeFrom}</span>
                  ) : (
                    <input
                      type="time"
                      value={formData.occurrenceTimeFrom}
                      onChange={(e) => updateField('occurrenceTimeFrom', e.target.value)}
                      className="w-full min-w-0 bg-black/5 px-2 py-0.5 rounded focus:outline-none"
                    />
                  )}
                </div>
                <div>
                  <span className="opacity-70 block">Date To</span>
                  {isFiled ? (
                    <span className="font-semibold">{formData.occurrenceDateTo || '--'}</span>
                  ) : (
                    <input
                      type="date"
                      value={formData.occurrenceDateTo}
                      onChange={(e) => updateField('occurrenceDateTo', e.target.value)}
                      className="w-full min-w-0 bg-black/5 px-2 py-0.5 rounded focus:outline-none"
                    />
                  )}
                </div>
                <div>
                  <span className="opacity-70 block">Time To</span>
                  {isFiled ? (
                    <span className="font-semibold">{formData.occurrenceTimeTo || '--'}</span>
                  ) : (
                    <input
                      type="time"
                      value={formData.occurrenceTimeTo}
                      onChange={(e) => updateField('occurrenceTimeTo', e.target.value)}
                      className="w-full min-w-0 bg-black/5 px-2 py-0.5 rounded focus:outline-none"
                    />
                  )}
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <div className="font-bold mb-1">b) Information Received at P.S.:</div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="opacity-70 block">Date</span>
                      {isFiled ? (
                        <span className="font-semibold">{formData.receivedDate}</span>
                      ) : (
                        <input
                          type="date"
                          value={formData.receivedDate}
                          onChange={(e) => updateField('receivedDate', e.target.value)}
                          className="w-full min-w-0 bg-black/5 px-2 py-0.5 rounded focus:outline-none"
                        />
                      )}
                    </div>
                    <div>
                      <span className="opacity-70 block">Time</span>
                      {isFiled ? (
                        <span className="font-semibold">{formData.receivedTime}</span>
                      ) : (
                        <input
                          type="time"
                          value={formData.receivedTime}
                          onChange={(e) => updateField('receivedTime', e.target.value)}
                          className="w-full min-w-0 bg-black/5 px-2 py-0.5 rounded focus:outline-none"
                        />
                      )}
                    </div>
                  </div>
                </div>

                <div>
                  <div className="font-bold mb-1">c) General Diary Reference:</div>
                  <div className="grid grid-cols-3 gap-1.5">
                    <div>
                      <span className="opacity-70 block">Entry No</span>
                      {isFiled ? (
                        <span className="font-semibold font-mono">{formData.gdEntryNo}</span>
                      ) : (
                        <input
                          type="text"
                          value={formData.gdEntryNo}
                          onChange={(e) => updateField('gdEntryNo', e.target.value)}
                          className="w-full bg-black/5 px-2 py-0.5 rounded focus:outline-none font-mono"
                        />
                      )}
                    </div>
                    <div className="col-span-2">
                      <span className="opacity-70 block">Date &amp; Time</span>
                      {isFiled ? (
                        <span className="font-semibold font-mono">{formData.gdDateTime}</span>
                      ) : (
                        <input
                          type="text"
                          value={formData.gdDateTime}
                          onChange={(e) => updateField('gdDateTime', e.target.value)}
                          className="w-full bg-black/5 px-2 py-0.5 rounded focus:outline-none font-mono"
                        />
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Section 4 */}
          <div className="border border-black p-3 flex justify-between items-center">
            <span className="font-bold">4. Type of Information:</span>
            {isFiled ? (
              <span className="font-semibold">{formData.typeOfInformation}</span>
            ) : (
              <select
                value={formData.typeOfInformation}
                onChange={(e) => updateField('typeOfInformation', e.target.value)}
                className="bg-black/5 px-3 py-1 rounded focus:outline-none"
              >
                <option value="Written">Written</option>
                <option value="Oral">Oral</option>
              </select>
            )}
          </div>

          {/* Section 5 */}
          <div className="border border-black p-3 space-y-2">
            <span className="font-bold block">5. Place of Occurrence:</span>
            <div className="grid grid-cols-3 gap-4 pl-3 mb-2">
              <div className="col-span-2">
                <span className="opacity-70 block">a) Distance and Direction From P.S. &amp; Beat No.</span>
                <div className="flex gap-2">
                  {isFiled ? (
                    <span className="font-semibold">{formData.distanceDirection}</span>
                  ) : (
                    <input
                      type="text"
                      value={formData.distanceDirection}
                      onChange={(e) => updateField('distanceDirection', e.target.value)}
                      className="flex-1 min-w-0 bg-black/5 px-2 py-0.5 rounded focus:outline-none"
                      placeholder="e.g. 2 km, East"
                    />
                  )}
                  {isFiled ? (
                    formData.beatNo && <span className="font-semibold font-mono">({formData.beatNo})</span>
                  ) : (
                    <input
                      type="text"
                      value={formData.beatNo}
                      onChange={(e) => updateField('beatNo', e.target.value)}
                      className="w-20 sm:w-24 shrink-0 min-w-0 bg-black/5 px-2 py-0.5 rounded focus:outline-none"
                      placeholder="Beat No"
                    />
                  )}
                </div>
              </div>
            </div>

            <div className="pl-3 space-y-2">
              <div>
                <span className="opacity-70 block">b) Address / Occurrence Place details:</span>
                {isFiled ? (
                  <span className="font-semibold">{formData.occurrenceAddress}</span>
                ) : (
                  <textarea
                    rows="2"
                    value={formData.occurrenceAddress}
                    onChange={(e) => updateField('occurrenceAddress', e.target.value)}
                    className="w-full bg-black/5 px-2 py-1 rounded focus:outline-none resize-none"
                  />
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-black/10 pt-2">
                <div className="sm:col-span-2 font-bold text-[10px] uppercase opacity-75">c) If outside limits of this PS:</div>
                <div>
                  <span className="opacity-70 block">Name of P.S.</span>
                  {isFiled ? (
                    <span className="font-semibold">{formData.outsideLimitPSName || 'N/A'}</span>
                  ) : (
                    <input
                      type="text"
                      value={formData.outsideLimitPSName}
                      onChange={(e) => updateField('outsideLimitPSName', e.target.value)}
                      className="w-full bg-black/5 px-2 py-0.5 rounded focus:outline-none"
                    />
                  )}
                </div>
                <div>
                  <span className="opacity-70 block">District</span>
                  {isFiled ? (
                    <span className="font-semibold">{formData.outsideLimitDistrict || 'N/A'}</span>
                  ) : (
                    <input
                      type="text"
                      value={formData.outsideLimitDistrict}
                      onChange={(e) => updateField('outsideLimitDistrict', e.target.value)}
                      className="w-full bg-black/5 px-2 py-0.5 rounded focus:outline-none"
                    />
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Section 6 */}
          <div className="border border-black p-3 space-y-2">
            <span className="font-bold block">6. Complainant / Informant:</span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pl-3">
              <div>
                <span className="opacity-70 block">a) Name</span>
                {isFiled ? (
                  <span className="font-bold">{formData.complainantName}</span>
                ) : (
                  <input
                    type="text"
                    value={formData.complainantName}
                    onChange={(e) => updateField('complainantName', e.target.value)}
                    className="w-full bg-black/5 px-2 py-0.5 rounded focus:outline-none font-bold"
                  />
                )}
              </div>
              <div>
                <span className="opacity-70 block">b) Father's / Husband's Name</span>
                {isFiled ? (
                  <span className="font-semibold">{formData.complainantRelative}</span>
                ) : (
                  <input
                    type="text"
                    value={formData.complainantRelative}
                    onChange={(e) => updateField('complainantRelative', e.target.value)}
                    className="w-full bg-black/5 px-2 py-0.5 rounded focus:outline-none"
                  />
                )}
              </div>
              <div>
                <span className="opacity-70 block">c) DOB &amp; Age</span>
                <div className="flex gap-1">
                  {isFiled ? (
                    <span className="font-semibold">{formData.complainantDob || '--'} / {formData.complainantAge}</span>
                  ) : (
                    <>
                      <input
                        type="text"
                        value={formData.complainantDob}
                        onChange={(e) => updateField('complainantDob', e.target.value)}
                        placeholder="DOB"
                        className="w-1/2 min-w-0 bg-black/5 px-1 py-0.5 rounded focus:outline-none"
                      />
                      <input
                        type="text"
                        value={formData.complainantAge}
                        onChange={(e) => updateField('complainantAge', e.target.value)}
                        placeholder="Age"
                        className="w-1/2 min-w-0 bg-black/5 px-1 py-0.5 rounded focus:outline-none"
                      />
                    </>
                  )}
                </div>
              </div>
              <div>
                <span className="opacity-70 block">d) Nationality</span>
                {isFiled ? (
                  <span className="font-semibold">{formData.complainantNationality}</span>
                ) : (
                  <input
                    type="text"
                    value={formData.complainantNationality}
                    onChange={(e) => updateField('complainantNationality', e.target.value)}
                    className="w-full bg-black/5 px-2 py-0.5 rounded focus:outline-none"
                  />
                )}
              </div>
              <div>
                <span className="opacity-70 block">e) Caste</span>
                {isFiled ? (
                  <span className="font-semibold">{formData.complainantCaste}</span>
                ) : (
                  <input
                    type="text"
                    value={formData.complainantCaste}
                    onChange={(e) => updateField('complainantCaste', e.target.value)}
                    className="w-full bg-black/5 px-2 py-0.5 rounded focus:outline-none"
                  />
                )}
              </div>
              <div>
                <span className="opacity-70 block">f) Passport / Doc details</span>
                {isFiled ? (
                  <span className="font-semibold">{formData.complainantPassport || 'N/A'}</span>
                ) : (
                  <input
                    type="text"
                    value={formData.complainantPassport}
                    onChange={(e) => updateField('complainantPassport', e.target.value)}
                    className="w-full bg-black/5 px-2 py-0.5 rounded focus:outline-none"
                    placeholder="Passport No"
                  />
                )}
              </div>
              <div>
                <span className="opacity-70 block">g) Occupation</span>
                {isFiled ? (
                  <span className="font-semibold">{formData.complainantOccupation}</span>
                ) : (
                  <input
                    type="text"
                    value={formData.complainantOccupation}
                    onChange={(e) => updateField('complainantOccupation', e.target.value)}
                    className="w-full bg-black/5 px-2 py-0.5 rounded focus:outline-none"
                  />
                )}
              </div>
              <div>
                <span className="opacity-70 block">Mobile No.</span>
                {isFiled ? (
                  <span className="font-semibold font-mono">{formData.complainantMobile}</span>
                ) : (
                  <input
                    type="text"
                    value={formData.complainantMobile}
                    onChange={(e) => updateField('complainantMobile', e.target.value)}
                    className="w-full bg-black/5 px-2 py-0.5 rounded focus:outline-none font-mono"
                  />
                )}
              </div>
              <div className="col-span-3">
                <span className="opacity-70 block">h) Complainant Permanent Address</span>
                {isFiled ? (
                  <span className="font-semibold">{formData.complainantAddress}</span>
                ) : (
                  <textarea
                    rows="2"
                    value={formData.complainantAddress}
                    onChange={(e) => updateField('complainantAddress', e.target.value)}
                    className="w-full bg-black/5 px-2 py-1 rounded focus:outline-none resize-none"
                  />
                )}
              </div>
            </div>
          </div>

          {/* Section 7 */}
          <div className="border border-black p-3 space-y-3">
            <div className="flex justify-between items-center">
              <span className="font-bold">7. Details of known / suspected / unknown accused with full particulars:</span>
              {!isFiled && (
                <button
                  type="button"
                  onClick={addAccused}
                  className="bg-blue-600 text-white font-bold text-[9px] px-2 py-1 rounded hover:bg-blue-700 no-print"
                >
                  + Add Accused
                </button>
              )}
            </div>

            {/* Accused Entries */}
            <div className="space-y-4 pl-3">
              {accusedList.map((accused, idx) => (
                <div key={idx} className="border border-black/10 p-3 space-y-2 relative bg-black/[0.01]">
                  {!isFiled && accusedList.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeAccused(idx)}
                      className="absolute top-2 right-2 text-red-500 hover:text-red-700 font-bold text-[10px] no-print"
                    >
                      ✕ Remove Accused
                    </button>
                  )}
                  <div className="font-bold border-b border-black/10 pb-1 flex gap-2 items-center">
                    <span className="w-5 h-5 rounded-full bg-black text-white flex items-center justify-center text-[10px]">
                      {idx + 1}
                    </span>
                    Accused Profile
                  </div>

                  <div className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-2 sm:border-r border-black/10 sm:pr-3">
                        <div className="flex gap-2">
                          <span className="opacity-75 font-bold text-[10px] w-5">a)</span>
                          <div className="flex-1">
                            <span className="opacity-75 block text-[10px]">Name</span>
                            {isFiled ? (
                              <span className="font-bold">{accused.name}</span>
                            ) : (
                              <input
                                type="text"
                                value={accused.name}
                                onChange={(e) => handleAccusedChange(idx, 'name', e.target.value)}
                                className="w-full bg-black/5 px-2 py-0.5 rounded focus:outline-none font-bold"
                              />
                            )}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <span className="opacity-75 font-bold text-[10px] w-5">b)</span>
                          <div className="flex-1">
                            <span className="opacity-75 block text-[10px]">Father's / Husband's Name</span>
                            {isFiled ? (
                              <span className="font-semibold">{accused.relative}</span>
                            ) : (
                              <input
                                type="text"
                                value={accused.relative}
                                onChange={(e) => handleAccusedChange(idx, 'relative', e.target.value)}
                                className="w-full bg-black/5 px-2 py-0.5 rounded focus:outline-none"
                              />
                            )}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <span className="opacity-75 font-bold text-[10px] w-5">c)</span>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 flex-1">
                            <div>
                              <span className="opacity-75 block text-[10px]">Occupation</span>
                              {isFiled ? (
                                <span className="font-semibold">{accused.occupation}</span>
                              ) : (
                                <input
                                  type="text"
                                  value={accused.occupation}
                                  onChange={(e) => handleAccusedChange(idx, 'occupation', e.target.value)}
                                  className="w-full bg-black/5 px-2 py-0.5 rounded focus:outline-none"
                                />
                              )}
                            </div>
                            <div>
                              <span className="opacity-75 block text-[10px]"><span className="font-bold">d)</span> Caste</span>
                              {isFiled ? (
                                <span className="font-semibold">{accused.caste}</span>
                              ) : (
                                <input
                                  type="text"
                                  value={accused.caste}
                                  onChange={(e) => handleAccusedChange(idx, 'caste', e.target.value)}
                                  className="w-full bg-black/5 px-2 py-0.5 rounded focus:outline-none"
                                />
                              )}
                            </div>
                            <div>
                              <span className="opacity-75 block text-[10px]"><span className="font-bold">e)</span> Gender</span>
                              {isFiled ? (
                                <span className="font-semibold">{accused.gender}</span>
                              ) : (
                                <select
                                  value={accused.gender}
                                  onChange={(e) => handleAccusedChange(idx, 'gender', e.target.value)}
                                  className="bg-black/5 px-2 py-0.5 rounded focus:outline-none w-full"
                                >
                                  <option value="Male">Male</option>
                                  <option value="Female">Female</option>
                                  <option value="Transgender">Transgender</option>
                                </select>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <span className="opacity-75 font-bold text-[10px] w-5">f)</span>
                          <div className="grid grid-cols-2 gap-2 flex-1">
                            <div>
                              <span className="opacity-75 block text-[10px]">Age</span>
                              {isFiled ? (
                                <span className="font-semibold">{accused.age}</span>
                              ) : (
                                <input
                                  type="text"
                                  value={accused.age}
                                  onChange={(e) => handleAccusedChange(idx, 'age', e.target.value)}
                                  className="w-full bg-black/5 px-2 py-0.5 rounded focus:outline-none"
                                />
                              )}
                            </div>
                            <div>
                              <span className="opacity-75 block text-[10px]">Nationality</span>
                              {isFiled ? (
                                <span className="font-semibold">{accused.nationality}</span>
                              ) : (
                                <input
                                  type="text"
                                  value={accused.nationality}
                                  onChange={(e) => handleAccusedChange(idx, 'nationality', e.target.value)}
                                  className="w-full bg-black/5 px-2 py-0.5 rounded focus:outline-none"
                                />
                              )}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Right side for Address and Contacts */}
                      <div className="space-y-2">
                        <div className="flex gap-2">
                          <span className="opacity-75 font-bold text-[10px] w-5">g)</span>
                          <div className="flex-1 space-y-2">
                            <span className="opacity-75 block font-bold text-[10px]">Address</span>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                              <div className="col-span-1">
                                <span className="opacity-75 block text-[9px]">House No</span>
                                {isFiled ? <span className="font-semibold">{accused.houseNo || '--'}</span> : <input type="text" value={accused.houseNo} onChange={(e) => handleAccusedChange(idx, 'houseNo', e.target.value)} className="w-full bg-black/5 px-1 py-0.5 rounded focus:outline-none" />}
                              </div>
                              <div className="col-span-1">
                                <span className="opacity-75 block text-[9px]">Street/Village</span>
                                {isFiled ? <span className="font-semibold">{accused.street || '--'}</span> : <input type="text" value={accused.street} onChange={(e) => handleAccusedChange(idx, 'street', e.target.value)} className="w-full bg-black/5 px-1 py-0.5 rounded focus:outline-none" />}
                              </div>
                              <div className="col-span-1">
                                <span className="opacity-75 block text-[9px]">Area/Mandal</span>
                                {isFiled ? <span className="font-semibold">{accused.area || '--'}</span> : <input type="text" value={accused.area} onChange={(e) => handleAccusedChange(idx, 'area', e.target.value)} className="w-full bg-black/5 px-1 py-0.5 rounded focus:outline-none" />}
                              </div>
                              <div className="col-span-1">
                                <span className="opacity-75 block text-[9px]">City/District</span>
                                {isFiled ? <span className="font-semibold">{accused.city || '--'}</span> : <input type="text" value={accused.city} onChange={(e) => handleAccusedChange(idx, 'city', e.target.value)} className="w-full bg-black/5 px-1 py-0.5 rounded focus:outline-none" />}
                              </div>
                              <div className="col-span-1">
                                <span className="opacity-75 block text-[9px]">State</span>
                                {isFiled ? <span className="font-semibold">{accused.state || '--'}</span> : <input type="text" value={accused.state} onChange={(e) => handleAccusedChange(idx, 'state', e.target.value)} className="w-full bg-black/5 px-1 py-0.5 rounded focus:outline-none" />}
                              </div>
                              <div className="col-span-1">
                                <span className="opacity-75 block text-[9px]">PIN</span>
                                {isFiled ? <span className="font-semibold">{accused.pin || '--'}</span> : <input type="text" value={accused.pin} onChange={(e) => handleAccusedChange(idx, 'pin', e.target.value)} className="w-full bg-black/5 px-1 py-0.5 rounded focus:outline-none" />}
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="flex gap-2">
                          <span className="opacity-75 font-bold text-[10px] w-5">h)</span>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 flex-1">
                            <div>
                              <span className="opacity-75 block text-[10px]">Phone(Off)</span>
                              {isFiled ? <span className="font-semibold">{accused.phoneOff || '--'}</span> : <input type="text" value={accused.phoneOff} onChange={(e) => handleAccusedChange(idx, 'phoneOff', e.target.value)} className="w-full bg-black/5 px-2 py-0.5 rounded focus:outline-none" />}
                            </div>
                            <div>
                              <span className="opacity-75 block text-[10px]">Phone(Resi)</span>
                              {isFiled ? <span className="font-semibold">{accused.phoneResi || '--'}</span> : <input type="text" value={accused.phoneResi} onChange={(e) => handleAccusedChange(idx, 'phoneResi', e.target.value)} className="w-full bg-black/5 px-2 py-0.5 rounded focus:outline-none" />}
                            </div>
                            <div>
                              <span className="opacity-75 block text-[10px]">Cell No</span>
                              {isFiled ? <span className="font-semibold">{accused.cellNo || '--'}</span> : <input type="text" value={accused.cellNo} onChange={(e) => handleAccusedChange(idx, 'cellNo', e.target.value)} className="w-full bg-black/5 px-2 py-0.5 rounded focus:outline-none" />}
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <span className="opacity-75 font-bold text-[10px] w-5">i)</span>
                          <div className="flex-1">
                            <span className="opacity-75 block text-[10px]">Email</span>
                            {isFiled ? <span className="font-semibold">{accused.email || '--'}</span> : <input type="text" value={accused.email} onChange={(e) => handleAccusedChange(idx, 'email', e.target.value)} className="w-full bg-black/5 px-2 py-0.5 rounded focus:outline-none" />}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Suspect physical features table 1 */}
            <div className="pt-2">
              <span className="font-bold block mb-2 opacity-75 pl-3">Physical features, deformities and other details of the Suspects:</span>
              <div className="overflow-x-auto pl-3 space-y-4">
                {/* Table 1: Basic features */}
                <div>
                  <table className="w-full text-left border border-black text-[9px] border-collapse">
                    <thead>
                      <tr className="bg-black/5 text-center font-bold border-b border-black">
                        <th className="border-r border-black p-1">S. No.</th>
                        <th className="border-r border-black p-1">Sex</th>
                        <th className="border-r border-black p-1">Date/Year of Birth</th>
                        <th className="border-r border-black p-1">Build</th>
                        <th className="border-r border-black p-1">Height (cms)</th>
                        <th className="border-r border-black p-1">Complexion</th>
                        <th className="border-r border-black p-1">Identification Marks(s)</th>
                        {!isFiled && <th className="p-1 no-print">Action</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {accusedList.map((acc, index) => (
                        <tr key={index} className="border-b border-black text-center">
                          <td className="border-r border-black p-1 font-bold">{index + 1}</td>
                          <td className="border-r border-black p-1">
                            {isFiled ? acc.gender : <select value={acc.gender} onChange={(e) => handleAccusedChange(index, 'gender', e.target.value)} className="bg-black/5 px-1 py-0.5 rounded focus:outline-none text-[9px]"><option value="Male">Male</option><option value="Female">Female</option><option value="Transgender">Transgender</option></select>}
                          </td>
                          <td className="border-r border-black p-1">
                            {isFiled ? acc.dob || '--' : <input type="text" value={acc.dob} onChange={(e) => handleAccusedChange(index, 'dob', e.target.value)} className="w-full bg-black/5 px-1 py-0.5 rounded focus:outline-none text-[9px] text-center" placeholder="dd-mm-yyyy" />}
                          </td>
                          <td className="border-r border-black p-1">
                            {isFiled ? acc.build || '--' : <input type="text" value={acc.build} onChange={(e) => handleAccusedChange(index, 'build', e.target.value)} className="w-full bg-black/5 px-1 py-0.5 rounded focus:outline-none text-[9px] text-center" placeholder="Build" />}
                          </td>
                          <td className="border-r border-black p-1">
                            {isFiled ? acc.height || '--' : <input type="text" value={acc.height} onChange={(e) => handleAccusedChange(index, 'height', e.target.value)} className="w-full bg-black/5 px-1 py-0.5 rounded focus:outline-none text-[9px] text-center" placeholder="cms" />}
                          </td>
                          <td className="border-r border-black p-1">
                            {isFiled ? acc.complexion || '--' : <input type="text" value={acc.complexion} onChange={(e) => handleAccusedChange(index, 'complexion', e.target.value)} className="w-full bg-black/5 px-1 py-0.5 rounded focus:outline-none text-[9px] text-center" />}
                          </td>
                          <td className="border-r border-black p-1">
                            {isFiled ? acc.idMarks || '--' : <input type="text" value={acc.idMarks} onChange={(e) => handleAccusedChange(index, 'idMarks', e.target.value)} className="w-full bg-black/5 px-1 py-0.5 rounded focus:outline-none text-[9px]" />}
                          </td>
                          {!isFiled && (
                            <td className="p-1 no-print">
                              {accusedList.length > 1 && (
                                <button type="button" onClick={() => removeAccused(index)} className="text-red-500 hover:text-red-700 font-bold text-[9px] px-1 py-0.5 border border-red-300 rounded">✕</button>
                              )}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!isFiled && (
                    <button type="button" onClick={addAccused} className="mt-1 bg-blue-50 border border-blue-400 text-blue-700 font-bold text-[9px] px-3 py-1 rounded hover:bg-blue-100 no-print">
                      + Add Row (Table 1)
                    </button>
                  )}
                </div>

                {/* Table 2: Secondary features */}
                <div>
                  <table className="w-full text-left border border-black text-[9px] border-collapse">
                    <thead>
                      <tr className="bg-black/5 text-center font-bold border-b border-black">
                        <th className="border-r border-black p-1">Deformalities/ Peculiarities</th>
                        <th className="border-r border-black p-1">Teeth</th>
                        <th className="border-r border-black p-1">Hair</th>
                        <th className="border-r border-black p-1">Eyes</th>
                        <th className="border-r border-black p-1">Habbit(s)</th>
                        <th className="border-r border-black p-1">Dress Habit(s)</th>
                        <th className="border-r border-black p-1">Languages/ Dialect</th>
                        {!isFiled && <th className="p-1 no-print">Action</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {accusedList.map((acc, index) => (
                        <tr key={index} className="border-b border-black text-center">
                          <td className="border-r border-black p-1">
                            {isFiled ? acc.deformities || '--' : <input type="text" value={acc.deformities} onChange={(e) => handleAccusedChange(index, 'deformities', e.target.value)} className="w-full bg-black/5 px-1 py-0.5 rounded focus:outline-none text-[9px] text-center" />}
                          </td>
                          <td className="border-r border-black p-1">
                            {isFiled ? acc.teeth || '--' : <input type="text" value={acc.teeth} onChange={(e) => handleAccusedChange(index, 'teeth', e.target.value)} className="w-full bg-black/5 px-1 py-0.5 rounded focus:outline-none text-[9px] text-center" />}
                          </td>
                          <td className="border-r border-black p-1">
                            {isFiled ? acc.hair || '--' : <input type="text" value={acc.hair} onChange={(e) => handleAccusedChange(index, 'hair', e.target.value)} className="w-full bg-black/5 px-1 py-0.5 rounded focus:outline-none text-[9px] text-center" />}
                          </td>
                          <td className="border-r border-black p-1">
                            {isFiled ? acc.eyes || '--' : <input type="text" value={acc.eyes} onChange={(e) => handleAccusedChange(index, 'eyes', e.target.value)} className="w-full bg-black/5 px-1 py-0.5 rounded focus:outline-none text-[9px] text-center" />}
                          </td>
                          <td className="border-r border-black p-1">
                            {isFiled ? acc.habits || '--' : <input type="text" value={acc.habits} onChange={(e) => handleAccusedChange(index, 'habits', e.target.value)} className="w-full bg-black/5 px-1 py-0.5 rounded focus:outline-none text-[9px] text-center" />}
                          </td>
                          <td className="border-r border-black p-1">
                            {isFiled ? acc.dressHabits || '--' : <input type="text" value={acc.dressHabits} onChange={(e) => handleAccusedChange(index, 'dressHabits', e.target.value)} className="w-full bg-black/5 px-1 py-0.5 rounded focus:outline-none text-[9px] text-center" />}
                          </td>
                          <td className="border-r border-black p-1">
                            {isFiled ? acc.languages || '--' : <input type="text" value={acc.languages} onChange={(e) => handleAccusedChange(index, 'languages', e.target.value)} className="w-full bg-black/5 px-1 py-0.5 rounded focus:outline-none text-[9px] text-center" />}
                          </td>
                          {!isFiled && (
                            <td className="p-1 no-print">
                              {accusedList.length > 1 && (
                                <button type="button" onClick={() => removeAccused(index)} className="text-red-500 hover:text-red-700 font-bold text-[9px] px-1 py-0.5 border border-red-300 rounded">✕</button>
                              )}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!isFiled && (
                    <button type="button" onClick={addAccused} className="mt-1 bg-blue-50 border border-blue-400 text-blue-700 font-bold text-[9px] px-3 py-1 rounded hover:bg-blue-100 no-print">
                      + Add Row (Table 2)
                    </button>
                  )}
                </div>

                {/* Table 3: Place of Marks */}
                <div>
                  <table className="w-full text-left border border-black text-[9px] border-collapse">
                    <thead>
                      <tr className="bg-black/5 text-center font-bold border-b border-black">
                        <th colSpan={!isFiled ? 6 : 5} className="p-1 border-b border-black">Place Of</th>
                      </tr>
                      <tr className="bg-black/5 text-center font-bold border-b border-black">
                        <th className="border-r border-black p-1">Burn Mark</th>
                        <th className="border-r border-black p-1">Leucoderma</th>
                        <th className="border-r border-black p-1">Mole</th>
                        <th className="border-r border-black p-1">Scar</th>
                        <th className="border-r border-black p-1">Tattoo</th>
                        {!isFiled && <th className="p-1 no-print">Action</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {accusedList.map((acc, index) => (
                        <tr key={index} className="border-b border-black text-center">
                          <td className="border-r border-black p-1">
                            {isFiled ? acc.burnMark || '--' : <input type="text" value={acc.burnMark} onChange={(e) => handleAccusedChange(index, 'burnMark', e.target.value)} className="w-full bg-black/5 px-1 py-0.5 rounded focus:outline-none text-[9px] text-center" />}
                          </td>
                          <td className="border-r border-black p-1">
                            {isFiled ? acc.leucoderma || '--' : <input type="text" value={acc.leucoderma} onChange={(e) => handleAccusedChange(index, 'leucoderma', e.target.value)} className="w-full bg-black/5 px-1 py-0.5 rounded focus:outline-none text-[9px] text-center" />}
                          </td>
                          <td className="border-r border-black p-1">
                            {isFiled ? acc.mole || '--' : <input type="text" value={acc.mole} onChange={(e) => handleAccusedChange(index, 'mole', e.target.value)} className="w-full bg-black/5 px-1 py-0.5 rounded focus:outline-none text-[9px] text-center" />}
                          </td>
                          <td className="border-r border-black p-1">
                            {isFiled ? acc.scar || '--' : <input type="text" value={acc.scar} onChange={(e) => handleAccusedChange(index, 'scar', e.target.value)} className="w-full bg-black/5 px-1 py-0.5 rounded focus:outline-none text-[9px] text-center" />}
                          </td>
                          <td className="border-r border-black p-1">
                            {isFiled ? acc.tattoo || '--' : <input type="text" value={acc.tattoo} onChange={(e) => handleAccusedChange(index, 'tattoo', e.target.value)} className="w-full bg-black/5 px-1 py-0.5 rounded focus:outline-none text-[9px] text-center" />}
                          </td>
                          {!isFiled && (
                            <td className="p-1 no-print">
                              {accusedList.length > 1 && (
                                <button type="button" onClick={() => removeAccused(index)} className="text-red-500 hover:text-red-700 font-bold text-[9px] px-1 py-0.5 border border-red-300 rounded">✕</button>
                              )}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!isFiled && (
                    <button type="button" onClick={addAccused} className="mt-1 bg-blue-50 border border-blue-400 text-blue-700 font-bold text-[9px] px-3 py-1 rounded hover:bg-blue-100 no-print">
                      + Add Row (Table 3)
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Section 8 */}
          <div className="border border-black p-3 space-y-1">
            <span className="font-bold block">8. Reasons for delay in reporting by the complainant / informant:</span>
            {isFiled ? (
              <span className="font-semibold">{formData.reasonsForDelay}</span>
            ) : (
              <input
                type="text"
                value={formData.reasonsForDelay}
                onChange={(e) => updateField('reasonsForDelay', e.target.value)}
                className="w-full bg-black/5 px-2 py-1 rounded focus:outline-none font-semibold"
              />
            )}
          </div>

          {/* Section 9 */}
          <div className="border border-black p-3 space-y-1">
            <span className="font-bold block">9. Particulars of properties stolen / involved:</span>
            {isFiled ? (
              <span className="font-semibold">{formData.propertiesStolen || 'N/A'}</span>
            ) : (
              <input
                type="text"
                value={formData.propertiesStolen}
                onChange={(e) => updateField('propertiesStolen', e.target.value)}
                className="w-full bg-black/5 px-2 py-1 rounded focus:outline-none"
                placeholder="Properties details"
              />
            )}
          </div>

          {/* Section 10 */}
          <div className="border border-black p-3 flex justify-between items-center">
            <span className="font-bold">10. Total value of property stolen:</span>
            {isFiled ? (
              <span className="font-bold font-mono text-red-600">Rs. {formData.totalValueStolen}</span>
            ) : (
              <input
                type="text"
                value={formData.totalValueStolen}
                onChange={(e) => updateField('totalValueStolen', e.target.value)}
                className="bg-black/5 px-3 py-1 rounded focus:outline-none font-bold text-right"
              />
            )}
          </div>

          {/* Section 11 */}
          <div className="border border-black p-3 space-y-1">
            <span className="font-bold block">11. Inquest Report / U.D. Case No.:</span>
            {isFiled ? (
              <span className="font-semibold">{formData.inquestReport || 'N/A'}</span>
            ) : (
              <input
                type="text"
                value={formData.inquestReport}
                onChange={(e) => updateField('inquestReport', e.target.value)}
                className="w-full bg-black/5 px-2 py-1 rounded focus:outline-none"
              />
            )}
          </div>

          {/* Section 12 */}
          <div className="border border-black p-3 space-y-2">
            <span className="font-bold block">12. Contents of the complaint / statement of the complainant or informant (Brief Facts of Case):</span>
            {isFiled ? (
              <p className="font-sans leading-relaxed text-sm border border-dashed border-black/20 p-3 bg-gray-50 whitespace-pre-wrap">
                {formData.incidentFacts}
              </p>
            ) : (
              <textarea
                rows="16"
                value={formData.incidentFacts}
                onChange={(e) => updateField('incidentFacts', e.target.value)}
                className="w-full bg-black/5 px-3 py-2 rounded focus:outline-none resize-y font-sans text-sm border border-black/10 leading-relaxed"
              />
            )}
          </div>

          {/* Section 13 */}
          <div className="p-3 space-y-4">
            <span className="font-bold block">13. Action taken:</span>
            <span className="font-bold block pl-3 text-sm">
              Since The above information reveals commission of offence(s) U/s as mentioned at item No:
            </span>
            <div className="pl-6 space-y-4 text-xs font-semibold">
              <div className="flex items-center gap-2">
                <input type="radio" checked={formData.actionTaken === '1'} onChange={() => !isFiled && updateField('actionTaken', '1')} disabled={isFiled} />
                <span>1) Registered the case and took up the investigation or</span>
                <span className="ml-8">Name</span>
                {isFiled ? (
                  <span className="border-b border-black border-dashed pb-0.5 inline-block min-w-[200px] text-center">{formData.actionTaken === '1' ? formData.officerName : ''}</span>
                ) : (
                  <input type="text" value={formData.officerName} onChange={(e) => updateField('officerName', e.target.value)} className="border-b border-black border-dashed bg-transparent focus:outline-none min-w-[200px] text-center" />
                )}
              </div>
              <div className="flex items-center gap-2">
                <input type="radio" checked={formData.actionTaken === '2'} onChange={() => !isFiled && updateField('actionTaken', '2')} disabled={isFiled} />
                <span>2) Directed to take up the Investigation or</span>
                <span className="ml-[62px]">Rank:</span>
                {isFiled ? (
                  <span className="border-b border-black border-dashed pb-0.5 inline-block w-32 text-center">{formData.actionTaken === '2' ? formData.officerRank : ''}</span>
                ) : (
                  <input type="text" value={formData.officerRank} onChange={(e) => updateField('officerRank', e.target.value)} className="border-b border-black border-dashed bg-transparent focus:outline-none w-32 text-center" />
                )}
                <span className="ml-4">No.</span>
                {isFiled ? (
                  <span className="border-b border-black border-dashed pb-0.5 inline-block w-24 text-center">{formData.actionTaken === '2' ? formData.officerNo : ''}</span>
                ) : (
                  <input type="text" value={formData.officerNo} onChange={(e) => updateField('officerNo', e.target.value)} className="border-b border-black border-dashed bg-transparent focus:outline-none w-24 text-center" />
                )}
              </div>
              <div className="flex items-center gap-2">
                <input type="radio" checked={formData.actionTaken === '3'} onChange={() => !isFiled && updateField('actionTaken', '3')} disabled={isFiled} />
                <span>3) Refused investigation due to</span>
                {isFiled ? (
                  <span className="border-b border-black border-dashed pb-0.5 inline-block flex-1">{formData.actionTaken === '3' ? formData.refusedInvestigationDueTo : ''}</span>
                ) : (
                  <input type="text" value={formData.refusedInvestigationDueTo} onChange={(e) => updateField('refusedInvestigationDueTo', e.target.value)} className="border-b border-black border-dashed bg-transparent focus:outline-none flex-1" />
                )}
              </div>
              <div className="flex items-center gap-2">
                <input type="radio" checked={formData.actionTaken === '4'} onChange={() => !isFiled && updateField('actionTaken', '4')} disabled={isFiled} />
                <span>4) Transferred to P.S</span>
                {isFiled ? (
                  <span className="border-b border-black border-dashed pb-0.5 inline-block w-48 text-center">{formData.actionTaken === '4' ? formData.transferredPS : ''}</span>
                ) : (
                  <input type="text" value={formData.transferredPS} onChange={(e) => updateField('transferredPS', e.target.value)} className="border-b border-black border-dashed bg-transparent focus:outline-none w-48 text-center" />
                )}
                <span className="ml-2">District</span>
                {isFiled ? (
                  <span className="border-b border-black border-dashed pb-0.5 inline-block w-40 text-center">{formData.actionTaken === '4' ? formData.transferredDistrict : ''}</span>
                ) : (
                  <input type="text" value={formData.transferredDistrict} onChange={(e) => updateField('transferredDistrict', e.target.value)} className="border-b border-black border-dashed bg-transparent focus:outline-none w-40 text-center" />
                )}
                <span className="ml-2">on point of jurisdiction.</span>
              </div>
            </div>

            <div className="font-bold text-sm mt-4">
              F.I.R. read over to the complainant / informant, admitted to be correctly recorded<br />
              and a copy given to the complainant /informant, free of cost. R.O.A.C
            </div>
          </div>

          {/* Section 14 */}
          <div className="border border-black p-3">
            <span className="font-bold block mb-4">14. Signatures &amp; Details:</span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 pt-4">
              <div className="text-center space-y-8 border-t border-black/10 pt-2">
                <div className="h-6" />
                <span className="font-bold block border-t border-black/20 pt-1 text-[9px] uppercase">
                  Signature / Thumb impression of Complainant
                </span>
              </div>
              <div className="text-center space-y-1 border-t border-black/10 pt-2">
                <div className="font-bold text-[10px]">{formData.officerName}</div>
                <div className="text-[9px] opacity-75">{formData.officerRank} No. {formData.officerNo}</div>
                <div className="h-3" />
                <span className="font-bold block border-t border-black/20 pt-1 text-[9px] uppercase">
                  Signature of Officer In-Charge, Police Station
                </span>
              </div>
            </div>
          </div>

          {/* Section 15 */}
          <div className="border border-black p-3 flex justify-between items-center">
            <span className="font-bold">15. Date and time of dispatch to the court:</span>
            {isFiled ? (
              <span className="font-mono font-bold text-blue-600">{formData.dispatchDateTime}</span>
            ) : (
              <input
                type="text"
                value={formData.dispatchDateTime}
                onChange={(e) => updateField('dispatchDateTime', e.target.value)}
                className="bg-black/5 px-3 py-1 rounded focus:outline-none font-bold font-mono text-right"
                placeholder="e.g. 18-03-2025 13:30:00"
              />
            )}
          </div>

        </div>

      </FIRCard>

    </div>
  );
}
