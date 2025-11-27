// AI Legacy Storyteller Component
import { supabase } from '/js/supabase-client.js';
import { showToast } from '/js/utils/toasts.js';

let storytellerModal = null;
let currentSession = null;
let prompts = [];
let currentPromptIndex = 0;
let responses = {};
let memorialId = null;

export async function initAIStoryteller(targetEl, memId) {
    memorialId = memId;

    try {
        // Load the component HTML
        const response = await fetch('/pages/ai-storyteller.html');
        if (!response.ok) throw new Error('Failed to load AI Storyteller component');

        const html = await response.text();
        targetEl.innerHTML = html;

        // Initialize Bootstrap modal
        const modalEl = document.getElementById('storytellerModal');
        if (modalEl && window.bootstrap?.Modal) {
            storytellerModal = new bootstrap.Modal(modalEl);
        }

        // Fetch initial data (prompts and any existing session)
        await loadStorytellerData();

        // Set up event listeners
        setupEventListeners();

    } catch (error) {
        console.error('Failed to initialize AI Storyteller:', error);
        targetEl.innerHTML = `
            <div class="alert alert-warning">
                <i class="fas fa-exclamation-triangle me-2"></i>
                AI Storyteller could not be loaded.
            </div>
        `;
    }
}

async function loadStorytellerData() {
    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        const response = await fetch(`/api/ai/storyteller?memorialId=${memorialId}`, {
            headers: {
                'Authorization': `Bearer ${session.access_token}`
            }
        });

        if (!response.ok) throw new Error('Failed to fetch storyteller data');

        const data = await response.json();
        prompts = data.prompts || [];
        currentSession = data.session;

        // If there's an existing session with responses, pre-fill
        if (currentSession?.prompt_responses) {
            responses = currentSession.prompt_responses;
        }

    } catch (error) {
        console.error('Failed to load storyteller data:', error);
    }
}

function setupEventListeners() {
    // Start button
    document.getElementById('start-storyteller-btn')?.addEventListener('click', startInterview);

    // Navigation buttons
    document.getElementById('storyteller-next-btn')?.addEventListener('click', handleNext);
    document.getElementById('storyteller-skip-btn')?.addEventListener('click', handleSkip);
    document.getElementById('storyteller-back-btn')?.addEventListener('click', handleBack);

    // Follow-up buttons
    document.getElementById('storyteller-followup-btn')?.addEventListener('click', requestFollowup);

    // Generate button
    document.getElementById('storyteller-generate-btn')?.addEventListener('click', generateStory);

    // Result buttons
    document.getElementById('use-story-btn')?.addEventListener('click', saveStory);
    document.getElementById('regenerate-story-btn')?.addEventListener('click', generateStory);
    document.getElementById('edit-story-btn')?.addEventListener('click', editStory);
}

async function startInterview() {
    if (!prompts.length) {
        showToast('Unable to start interview. Please try again.', 'error');
        return;
    }

    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
            showToast('Please sign in to use AI Storyteller', 'error');
            return;
        }

        // Start a new session
        const response = await fetch('/api/ai/storyteller', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`
            },
            body: JSON.stringify({
                action: 'start',
                memorialId
            })
        });

        if (!response.ok) throw new Error('Failed to start session');

        const data = await response.json();
        currentSession = data.session;
        currentPromptIndex = 0;
        responses = {};

        // Show the first question
        showQuestion(0);

        // Open modal
        storytellerModal?.show();

    } catch (error) {
        console.error('Failed to start interview:', error);
        showToast('Failed to start the interview. Please try again.', 'error');
    }
}

function showQuestion(index) {
    if (index >= prompts.length) {
        // All questions answered, show generate option
        showGenerateScreen();
        return;
    }

    const prompt = prompts[index];
    currentPromptIndex = index;

    // Update UI
    document.getElementById('question-number').textContent = `Question ${index + 1} of ${prompts.length}`;
    document.getElementById('question-title').textContent = prompt.title;
    document.getElementById('question-text').textContent = prompt.question;

    // Pre-fill if there's an existing answer
    const answerInput = document.getElementById('storyteller-answer');
    if (answerInput) {
        answerInput.value = responses[prompt.id] || '';
    }

    // Update progress bar
    updateProgress((index / prompts.length) * 100);

    // Show/hide buttons
    showScreen('question');
    toggleNavButtons(index);
}

function toggleNavButtons(index) {
    const backBtn = document.getElementById('storyteller-back-btn');
    const skipBtn = document.getElementById('storyteller-skip-btn');
    const nextBtn = document.getElementById('storyteller-next-btn');
    const followupBtn = document.getElementById('storyteller-followup-btn');
    const generateBtn = document.getElementById('storyteller-generate-btn');

    // Back button visibility
    if (backBtn) {
        backBtn.style.display = index > 0 ? 'inline-block' : 'none';
    }

    // Show regular nav for questions
    if (skipBtn) skipBtn.classList.remove('d-none');
    if (nextBtn) nextBtn.classList.remove('d-none');
    if (followupBtn) followupBtn.classList.add('d-none');
    if (generateBtn) generateBtn.classList.add('d-none');
}

function showGenerateScreen() {
    // Hide regular nav, show generate options
    const skipBtn = document.getElementById('storyteller-skip-btn');
    const nextBtn = document.getElementById('storyteller-next-btn');
    const followupBtn = document.getElementById('storyteller-followup-btn');
    const generateBtn = document.getElementById('storyteller-generate-btn');
    const backBtn = document.getElementById('storyteller-back-btn');

    if (skipBtn) skipBtn.classList.add('d-none');
    if (nextBtn) nextBtn.classList.add('d-none');
    if (followupBtn) followupBtn.classList.remove('d-none');
    if (generateBtn) generateBtn.classList.remove('d-none');
    if (backBtn) backBtn.style.display = 'inline-block';

    // Update subtitle
    document.getElementById('storyteller-subtitle').textContent = 'Ready to generate your story';

    // Show a summary
    document.getElementById('storyteller-question-screen').innerHTML = `
        <div class="storyteller-question-card">
            <span class="storyteller-question-number">All Questions Answered!</span>
            <h3 class="storyteller-question-title">Ready to Generate</h3>
            <p class="storyteller-question-text">You've answered ${Object.keys(responses).length} questions. You can ask the AI for more details or generate the story now.</p>
        </div>
        <div class="storyteller-summary">
            <h5 style="color: rgba(255,255,255,0.6); font-size: 0.85rem; margin-bottom: 12px;">YOUR RESPONSES:</h5>
            ${Object.entries(responses).filter(([k]) => !k.startsWith('followup_')).map(([key, value]) => {
                const prompt = prompts.find(p => p.id === key);
                return `
                    <div style="margin-bottom: 16px; padding: 12px; background: rgba(255,255,255,0.05); border-radius: 8px;">
                        <strong style="color: #667eea; font-size: 0.8rem;">${prompt?.title || key}</strong>
                        <p style="color: rgba(255,255,255,0.8); margin: 8px 0 0 0; font-size: 0.9rem;">${escapeHtml(value.substring(0, 150))}${value.length > 150 ? '...' : ''}</p>
                    </div>
                `;
            }).join('')}
        </div>
    `;

    updateProgress(100);
}

async function handleNext() {
    const answerInput = document.getElementById('storyteller-answer');
    const answer = answerInput?.value?.trim();

    if (!answer) {
        showToast('Please provide an answer or click Skip', 'error');
        return;
    }

    const prompt = prompts[currentPromptIndex];
    responses[prompt.id] = answer;

    // Save to server
    await saveAnswer(prompt.id, answer);

    // Move to next question
    showQuestion(currentPromptIndex + 1);
}

function handleSkip() {
    // Move to next question without saving
    showQuestion(currentPromptIndex + 1);
}

function handleBack() {
    if (currentPromptIndex > 0) {
        showQuestion(currentPromptIndex - 1);
    }
}

async function saveAnswer(promptId, response) {
    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session || !currentSession) return;

        await fetch('/api/ai/storyteller', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`
            },
            body: JSON.stringify({
                action: 'answer',
                memorialId,
                sessionId: currentSession.id,
                promptId,
                response
            })
        });
    } catch (error) {
        console.error('Failed to save answer:', error);
    }
}

async function requestFollowup() {
    const btn = document.getElementById('storyteller-followup-btn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Thinking...';

    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session || !currentSession) return;

        const response = await fetch('/api/ai/storyteller', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`
            },
            body: JSON.stringify({
                action: 'followup',
                memorialId,
                sessionId: currentSession.id
            })
        });

        if (!response.ok) {
            const error = await response.json();
            if (error.canGenerate) {
                showToast('Max AI questions reached. Generate your story now!', 'info');
                return;
            }
            throw new Error(error.error);
        }

        const data = await response.json();

        // Show follow-up screen
        showScreen('followup');
        document.getElementById('followup-question').textContent = data.followupQuestion;
        document.getElementById('interactions-remaining').textContent = `${data.interactionsRemaining} AI questions remaining`;

        // Update buttons for follow-up mode
        document.getElementById('storyteller-skip-btn')?.classList.remove('d-none');
        document.getElementById('storyteller-next-btn')?.classList.remove('d-none');

        // Change next button to submit follow-up
        const nextBtn = document.getElementById('storyteller-next-btn');
        if (nextBtn) {
            nextBtn.textContent = 'Submit';
            nextBtn.onclick = submitFollowupAnswer;
        }

    } catch (error) {
        console.error('Failed to get follow-up:', error);
        showToast('Failed to get AI follow-up question', 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-robot me-1"></i>Ask AI for More';
    }
}

async function submitFollowupAnswer() {
    const answerInput = document.getElementById('storyteller-followup-answer');
    const answer = answerInput?.value?.trim();

    if (!answer) {
        showToast('Please provide an answer', 'error');
        return;
    }

    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session || !currentSession) return;

        const response = await fetch('/api/ai/storyteller', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`
            },
            body: JSON.stringify({
                action: 'answer_followup',
                memorialId,
                sessionId: currentSession.id,
                response: answer
            })
        });

        if (!response.ok) throw new Error('Failed to save follow-up answer');

        const data = await response.json();

        // Add to local responses
        const followupKey = `followup_${Object.keys(responses).filter(k => k.startsWith('followup_')).length + 1}`;
        responses[followupKey] = answer;

        // Return to generate screen
        showGenerateScreen();
        showScreen('question');

        // Reset next button
        const nextBtn = document.getElementById('storyteller-next-btn');
        if (nextBtn) {
            nextBtn.innerHTML = 'Next <i class="fas fa-arrow-right ms-1"></i>';
            nextBtn.onclick = handleNext;
        }

        // Clear follow-up answer
        if (answerInput) answerInput.value = '';

    } catch (error) {
        console.error('Failed to submit follow-up:', error);
        showToast('Failed to save your answer', 'error');
    }
}

async function generateStory() {
    showScreen('generating');

    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session || !currentSession) return;

        const response = await fetch('/api/ai/storyteller', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`
            },
            body: JSON.stringify({
                action: 'generate',
                memorialId,
                sessionId: currentSession.id
            })
        });

        if (!response.ok) throw new Error('Failed to generate story');

        const data = await response.json();

        // Show the result
        document.getElementById('generated-story-preview').textContent = data.story;
        showScreen('result');

        // Hide footer buttons for result screen
        document.querySelector('.storyteller-modal-footer').style.display = 'none';

    } catch (error) {
        console.error('Failed to generate story:', error);
        showToast('Failed to generate story. Please try again.', 'error');
        showGenerateScreen();
        showScreen('question');
    }
}

async function saveStory() {
    const btn = document.getElementById('use-story-btn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Saving...';

    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session || !currentSession) return;

        const response = await fetch('/api/ai/storyteller', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`
            },
            body: JSON.stringify({
                action: 'save',
                memorialId,
                sessionId: currentSession.id
            })
        });

        if (!response.ok) throw new Error('Failed to save story');

        showToast('Story saved to memorial!', 'success');
        storytellerModal?.hide();

        // Refresh the page to show the new biography
        window.location.reload();

    } catch (error) {
        console.error('Failed to save story:', error);
        showToast('Failed to save story. Please try again.', 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-check me-2"></i>Use This Story';
    }
}

function editStory() {
    // Copy story to clipboard and close modal
    const story = document.getElementById('generated-story-preview').textContent;
    navigator.clipboard.writeText(story).then(() => {
        showToast('Story copied to clipboard. Paste it in the biography field to edit.', 'success');
        storytellerModal?.hide();
    }).catch(() => {
        showToast('Could not copy story. Please select and copy manually.', 'error');
    });
}

function showScreen(screen) {
    const screens = {
        question: document.getElementById('storyteller-question-screen'),
        followup: document.getElementById('storyteller-followup-screen'),
        generating: document.getElementById('storyteller-generating-screen'),
        result: document.getElementById('storyteller-result-screen')
    };

    Object.entries(screens).forEach(([key, el]) => {
        if (el) {
            el.classList.toggle('d-none', key !== screen);
        }
    });

    // Show footer for all screens except result
    const footer = document.querySelector('.storyteller-modal-footer');
    if (footer) {
        footer.style.display = screen === 'result' ? 'none' : 'flex';
    }
}

function updateProgress(percent) {
    const bar = document.getElementById('storyteller-progress-bar');
    if (bar) {
        bar.style.width = `${percent}%`;
    }
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
