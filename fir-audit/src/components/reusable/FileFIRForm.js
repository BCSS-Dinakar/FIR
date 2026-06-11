import SectionSelector from './SectionSelector';

export default function FileFIRForm({
  dark,
  formData,
  setFormData,
  modalSections,
  setModalSections,
  selectedPetition,
  allBnsSections
}) {
  const T = {
    input: (d) => d ? 'bg-white/[0.03] border-white/10 text-white placeholder-white/30' : 'bg-black/[0.02] border-black/10 text-brand-charcoal placeholder-black/30',
    muted: (d) => d ? 'text-white/50' : 'text-black/50',
    label: 'text-[10px] font-black uppercase tracking-wider block mb-1 opacity-60',
  };

  const updateField = (field, val) => {
    setFormData(prev => ({
      ...prev,
      [field]: val
    }));
  };

  return (
    <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2 text-xs">
      
      {/* 1. Station Record Info */}
      <div className="border-b border-gray-400/10 pb-3">
        <h4 className="font-bold text-[11px] text-blue-500 mb-2 flex items-center gap-1.5">
          <span>🏛️</span> Station Registry Details
        </h4>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={T.label}>District</label>
            <input 
              type="text" 
              value={formData.district}
              onChange={(e) => updateField('district', e.target.value)}
              className={`w-full px-3 py-2 rounded-lg border text-xs font-semibold focus:outline-none ${T.input(dark)}`}
            />
          </div>
          <div>
            <label className={T.label}>Police Station</label>
            <input 
              type="text" 
              value={formData.policeStation}
              onChange={(e) => updateField('policeStation', e.target.value)}
              className={`w-full px-3 py-2 rounded-lg border text-xs font-semibold focus:outline-none ${T.input(dark)}`}
            />
          </div>
          <div className="col-span-2">
            <label className={T.label}>GD (General Diary) Entry No.</label>
            <input 
              type="text" 
              value={formData.gdNumber}
              onChange={(e) => updateField('gdNumber', e.target.value)}
              className={`w-full px-3 py-2 rounded-lg border text-xs font-semibold focus:outline-none ${T.input(dark)}`}
              placeholder="e.g. GD-2026-9824"
            />
          </div>
        </div>
      </div>

      {/* 2. Date/Time & Place of Occurrence */}
      <div className="border-b border-gray-400/10 pb-3">
        <h4 className="font-bold text-[11px] text-blue-500 mb-2 flex items-center gap-1.5">
          <span>📅</span> Date, Time &amp; Place of Occurrence
        </h4>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={T.label}>Date of Occurrence</label>
            <input 
              type="date" 
              value={formData.incidentDate}
              onChange={(e) => updateField('incidentDate', e.target.value)}
              className={`w-full px-3 py-2 rounded-lg border text-xs font-semibold focus:outline-none ${T.input(dark)}`}
            />
          </div>
          <div>
            <label className={T.label}>Time of Occurrence</label>
            <input 
              type="time" 
              value={formData.incidentTime}
              onChange={(e) => updateField('incidentTime', e.target.value)}
              className={`w-full px-3 py-2 rounded-lg border text-xs font-semibold focus:outline-none ${T.input(dark)}`}
            />
          </div>
          <div>
            <label className={T.label}>Distance/Direction from PS</label>
            <input 
              type="text" 
              value={formData.distanceDirection}
              onChange={(e) => updateField('distanceDirection', e.target.value)}
              placeholder="e.g. 3 km South"
              className={`w-full px-3 py-2 rounded-lg border text-xs font-semibold focus:outline-none ${T.input(dark)}`}
            />
          </div>
          <div>
            <label className={T.label}>Beat No. / Area</label>
            <input 
              type="text" 
              value={formData.beatNumber}
              onChange={(e) => updateField('beatNumber', e.target.value)}
              placeholder="e.g. Beat No. 4"
              className={`w-full px-3 py-2 rounded-lg border text-xs font-semibold focus:outline-none ${T.input(dark)}`}
            />
          </div>
          <div className="col-span-2">
            <label className={T.label}>Place of Occurrence (Address)</label>
            <input 
              type="text" 
              value={formData.occurrencePlace}
              onChange={(e) => updateField('occurrencePlace', e.target.value)}
              placeholder="e.g. Banjara Hills Road No 4, Hyderabad"
              className={`w-full px-3 py-2 rounded-lg border text-xs font-semibold focus:outline-none ${T.input(dark)}`}
            />
          </div>
        </div>
      </div>

      {/* 3. Complainant Details */}
      <div className="border-b border-gray-400/10 pb-3">
        <h4 className="font-bold text-[11px] text-blue-500 mb-2 flex items-center gap-1.5">
          <span>👤</span> Complainant / Informant Details
        </h4>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={T.label}>Complainant Name</label>
            <input 
              type="text" 
              value={formData.complainant}
              onChange={(e) => updateField('complainant', e.target.value)}
              className={`w-full px-3 py-2 rounded-lg border text-xs font-semibold focus:outline-none ${T.input(dark)}`}
            />
          </div>
          <div>
            <label className={T.label}>Father's / Husband's Name</label>
            <input 
              type="text" 
              value={formData.complainantRelative}
              onChange={(e) => updateField('complainantRelative', e.target.value)}
              placeholder="Relative's name"
              className={`w-full px-3 py-2 rounded-lg border text-xs font-semibold focus:outline-none ${T.input(dark)}`}
            />
          </div>
          <div>
            <label className={T.label}>Nationality</label>
            <input 
              type="text" 
              value={formData.nationality}
              onChange={(e) => updateField('nationality', e.target.value)}
              className={`w-full px-3 py-2 rounded-lg border text-xs font-semibold focus:outline-none ${T.input(dark)}`}
            />
          </div>
          <div>
            <label className={T.label}>Contact Number</label>
            <input 
              type="text" 
              value={formData.complainantPhone}
              onChange={(e) => updateField('complainantPhone', e.target.value)}
              placeholder="10-digit mobile number"
              className={`w-full px-3 py-2 rounded-lg border text-xs font-semibold focus:outline-none ${T.input(dark)}`}
            />
          </div>
          <div className="col-span-2">
            <label className={T.label}>Full Address</label>
            <input 
              type="text" 
              value={formData.complainantAddress}
              onChange={(e) => updateField('complainantAddress', e.target.value)}
              placeholder="Residential address"
              className={`w-full px-3 py-2 rounded-lg border text-xs font-semibold focus:outline-none ${T.input(dark)}`}
            />
          </div>
        </div>
      </div>

      {/* 4. Accused Particulars */}
      <div className="border-b border-gray-400/10 pb-3">
        <h4 className="font-bold text-[11px] text-blue-500 mb-2 flex items-center gap-1.5">
          <span>🚨</span> Accused Particulars
        </h4>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={T.label}>Primary Suspect / Accused</label>
            <input 
              type="text" 
              value={formData.accused}
              onChange={(e) => updateField('accused', e.target.value)}
              className={`w-full px-3 py-2 rounded-lg border text-xs font-semibold focus:outline-none ${T.input(dark)}`}
            />
          </div>
          <div>
            <label className={T.label}>Count of Accused</label>
            <input 
              type="number" 
              value={formData.accusedCount}
              onChange={(e) => updateField('accusedCount', Number(e.target.value))}
              min="1"
              className={`w-full px-3 py-2 rounded-lg border text-xs font-semibold focus:outline-none ${T.input(dark)}`}
            />
          </div>
          <div className="col-span-2">
            <label className={T.label}>Accused Descriptions / Remarks</label>
            <input 
              type="text" 
              value={formData.accusedDescription}
              onChange={(e) => updateField('accusedDescription', e.target.value)}
              placeholder='e.g. Unknown 2 persons, approx height 5 foot 8'
              className={`w-full px-3 py-2 rounded-lg border text-xs font-semibold focus:outline-none ${T.input(dark)}`}
            />
          </div>
        </div>
      </div>

      {/* 5. Legal Sections dropdown */}
      <div>
        <SectionSelector
          dark={dark}
          sections={modalSections}
          onChange={setModalSections}
          recommendedSections={selectedPetition.sections}
          allBnsSections={allBnsSections}
        />
      </div>

      {/* 6. FIR Summary / Brief Facts */}
      <div>
        <label className={T.label}>Incident Summary &amp; Brief Facts (FIR Contents)</label>
        <textarea
          rows="4"
          value={formData.incidentFacts}
          onChange={(e) => updateField('incidentFacts', e.target.value)}
          className={`w-full px-3 py-2 rounded-lg border text-xs font-semibold focus:outline-none resize-none ${T.input(dark)}`}
        />
      </div>

    </div>
  );
}
