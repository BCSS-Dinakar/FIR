    const fileInput = document.getElementById('fileInput');
    const uploadContent = document.getElementById('uploadContent');
    const imagePreview = document.getElementById('imagePreview');
    const dropArea = document.getElementById('dropArea');

    // Drag and drop effects
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropArea.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    ['dragenter', 'dragover'].forEach(eventName => {
        dropArea.addEventListener(eventName, () => dropArea.classList.add('dragover'), false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropArea.addEventListener(eventName, () => dropArea.classList.remove('dragover'), false);
    });

    dropArea.addEventListener('drop', handleDrop, false);

    function handleDrop(e) {
        const dt = e.dataTransfer;
        const files = dt.files;
        if(files.length > 0) {
            document.querySelectorAll('.sample-img').forEach(i => i.classList.remove('selected'));
            fileInput.files = files;
            updatePreview(files[0]);
        }
    }

    // Show image preview when selected
    fileInput.addEventListener('change', function(e) {
        if (this.files && this.files[0]) {
            document.querySelectorAll('.sample-img').forEach(i => i.classList.remove('selected'));
            updatePreview(this.files[0]);
        }
    });

    function updatePreview(file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            imagePreview.src = e.target.result;
            imagePreview.style.display = 'block';
            uploadContent.style.display = 'none';
            dropArea.style.padding = '15px';
        }
        reader.readAsDataURL(file);
    }

    // Sample image selection
    const sampleImages = document.querySelectorAll('.sample-img');
    
    sampleImages.forEach(img => {
        img.addEventListener('click', async () => {
            // Fetch the image and create a File object
            try {
                // Extract filename from src
                const filename = img.src.split('/').pop();
                
                // If opened as a local file, fetch from the local dev server
                const fetchUrl = window.location.protocol === 'file:' 
                    ? `http://localhost:3000/test_petitions/${filename}` 
                    : img.src;

                const response = await fetch(fetchUrl, { mode: 'cors' });
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                const blob = await response.blob();
                
                const file = new File([blob], filename, { type: blob.type });
                
                // Create a DataTransfer object to assign to fileInput
                const dataTransfer = new DataTransfer();
                dataTransfer.items.add(file);
                fileInput.files = dataTransfer.files;
                
                // Remove selected class from all
                sampleImages.forEach(i => i.classList.remove('selected'));
                // Add selected class to this
                img.classList.add('selected');
                
                // Trigger preview
                updatePreview(file);
            } catch (error) {
                console.error('Error loading sample image:', error);
                alert('Error selecting image: ' + error.message);
            }
        });
    });

    // Keyboard accessibility for drop area
    dropArea.addEventListener('keydown', function(e) {
        if(e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            fileInput.click();
        }
    });

    // Handle form submission
    document.getElementById('uploadForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const file = fileInput.files[0];
        if (!file) return alert('Please select an image first.');

        const formData = new FormData();
        formData.append('petitionImage', file);

        const submitBtn = document.getElementById('submitBtn');
        const loader = document.getElementById('loader');
        const resultDiv = document.getElementById('result');

        submitBtn.disabled = true;
        submitBtn.textContent = 'Processing...';
        loader.style.display = 'block';
        resultDiv.style.display = 'none';
        resultDiv.className = ''; // Reset classes

        try {
            // Send to our local Express microservice
            const apiUrl = window.location.protocol === 'file:' 
                ? 'http://localhost:3000/api/analyze-petition' 
                : '/api/analyze-petition';
                
            const response = await fetch(apiUrl, {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Server error');
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder("utf-8");
            let finalData = null;

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                
                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n').filter(line => line.trim());
                
                for (const line of lines) {
                    try {
                        const data = JSON.parse(line);
                        if (data.status === 'progress') {
                            loader.innerHTML = `<span style="font-size: 20px; margin-right: 8px; display: inline-block; animation: spin 2s linear infinite;">⚙️</span> ${data.message}`;
                        } else if (data.status === 'complete') {
                            finalData = data;
                        } else if (data.status === 'error') {
                            throw new Error(data.message);
                        }
                    } catch(e) {
                        if (e.message !== "Unexpected end of JSON input" && !e.message.includes("Unexpected token")) {
                            throw e;
                        }
                    }
                }
            }
            
            resultDiv.style.display = 'block';
            if (finalData) {
                resultDiv.classList.add('result-success');
                resultDiv.innerHTML = generateReportHTML(finalData);
            }
        } catch (error) {
            resultDiv.style.display = 'block';
            resultDiv.classList.add('result-error');
            resultDiv.innerHTML = `<strong style="color: var(--error); font-family: 'Outfit', sans-serif;">✗ Connection Error</strong>\nEnsure the server is running on port 5001.\n${error.message}`;
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Analyze with AI';
            loader.style.display = 'none';
        }
    });

    function generateReportHTML(data) {
        const s1 = data.step1 || {};
        const s2 = data.step2 || {};

        let statusColor = 'var(--success)';
        if (s2.status === 'INVALID') statusColor = 'var(--error)';
        if (s2.status === 'INCOMPLETE') statusColor = '#f59e0b';

        let html = `
            <div style="margin-bottom: 20px;">
                <h3 style="display: inline-block; margin-right: 15px; color: white;">Petition Analysis</h3>
                <span style="background-color: ${statusColor}; color: white; padding: 4px 12px; border-radius: 12px; font-weight: bold; font-size: 13px;">
                    ${s2.status || 'UNKNOWN'}
                </span>
            </div>
        `;

        if (s2.missing_fields && s2.missing_fields.length > 0) {
            html += `
            <div style="margin-bottom: 15px;">
                <strong style="color: #fca5a5;">❌ Missing Information:</strong>
                <ul style="margin-top: 8px; margin-left: 20px; color: #e2e8f0; line-height: 1.8;">
                    ${s2.missing_fields.map(field => `<li>Missing ${field.replace(/\\./g, ' ').replace(/_/g, ' ')}</li>`).join('')}
                </ul>
            </div>`;
        }

        if (s2.errors && s2.errors.length > 0) {
            html += `
            <div style="margin-bottom: 15px;">
                <strong style="color: var(--error);">⚠️ Errors:</strong>
                <ul style="margin-top: 8px; margin-left: 20px; color: #e2e8f0; line-height: 1.8;">
                    ${s2.errors.map(e => `<li>${e}</li>`).join('')}
                </ul>
            </div>`;
        }

        if (s2.warnings && s2.warnings.length > 0) {
            html += `
            <div style="margin-bottom: 15px;">
                <strong style="color: #f59e0b;">⚠️ Warnings:</strong>
                <ul style="margin-top: 8px; margin-left: 20px; color: #e2e8f0; line-height: 1.8;">
                    ${s2.warnings.map(w => `<li>${w}</li>`).join('')}
                </ul>
            </div>`;
        }

        const w = s2.five_w_h || {};
        html += `
            <div style="margin-bottom: 15px;">
                <strong style="color: #60a5fa;">📝 5W1H Summary:</strong>
                <ul style="margin-top: 8px; margin-left: 20px; color: #e2e8f0; line-height: 1.8;">
                    <li><strong>WHO:</strong> ${w.who?.complainant?.name || 'Unknown'} (Complainant), ${w.who?.accused?.name || 'Unknown'} (Accused)</li>
                    <li><strong>WHAT:</strong> ${w.what?.incident?.description || 'Unknown'}</li>
                    <li><strong>WHEN:</strong> ${w.when?.time?.description || 'Unknown'}</li>
                    <li><strong>WHERE:</strong> ${w.where?.location?.description || 'Unknown'}</li>
                    <li><strong>WHY:</strong> ${w.why?.motive?.description || 'Unknown'}</li>
                    <li><strong>HOW:</strong> ${w.how?.method?.description || 'Unknown'}</li>
                </ul>
            </div>
        `;

        const s3 = data.step3;
        if (s3 && s3.applicable_sections && s3.applicable_sections.length > 0) {
            html += `
            <div style="margin-bottom: 15px;">
                <strong style="color: #c084fc;">⚖️ Legal Audit & Applied Sections (BNS):</strong>
                <div style="margin-top: 8px;">
                    ${s3.applicable_sections.map(sec => `
                        <div style="background: rgba(147, 51, 234, 0.15); border-left: 4px solid #c084fc; padding: 10px 14px; margin-bottom: 8px; border-radius: 4px;">
                            <strong style="color: #e9d5ff; font-size: 15px;">${sec.section_name}</strong> - <span style="color: #d8b4fe; font-weight: 500;">${sec.offence}</span>
                            <p style="color: #e2e8f0; font-size: 13.5px; margin-top: 6px; line-height: 1.5;">${sec.justification}</p>
                        </div>
                    `).join('')}
                </div>
            </div>`;

            if (s3.fir_narrative_draft) {
                html += `
                <div style="margin-bottom: 15px;">
                    <strong style="color: #c084fc;">📝 FIR Narrative Draft:</strong>
                    <div style="background: rgba(15, 23, 42, 0.5); padding: 16px; border-radius: 8px; margin-top: 8px; font-size: 14.5px; color: #f8fafc; border: 1px solid rgba(192,132,252,0.2); font-style: italic; line-height: 1.6;">
                        "${s3.fir_narrative_draft}"
                    </div>
                </div>`;
            }
        }

        html += `
            <div style="margin-top: 24px; padding-top: 15px; border-top: 1px solid rgba(255,255,255,0.1);">
                <strong style="color: #60a5fa;">🌐 Translated Text (${s1.original_language || 'Unknown'}):</strong>
                <p style="margin-top: 10px; color: #cbd5e1; white-space: pre-wrap; font-size: 14px;">${s1.english_translation || 'No translation available.'}</p>
            </div>
        `;

        return html;
    }
