// Guide Progress Management
import { Analytics } from './analytics.js';

export const GuideManager = {
    currentStep: 0,
    completedSteps: new Set(),
    totalSteps: { mac: 6, windows: 6 },
    SHEET_URL: 'https://script.google.com/macros/s/AKfycbwT8THqsbVh89-zpAUHf_nLQ1l468OVDy3xuQPRRca8Wc1QNDgt2Tk98fMUSndtD_pm/exec',
    sessionId: null,
    startTime: null,
    errorSteps: [],
    
    init() {
        this.initSession();
        this.loadProgress();
        this.setupProgressBar();
        this.setupResultButtons();
        this.setupTroubleshooting();
        this.setupAccordion();
        this.updateProgress();
        this.initSatisfactionDisplay();
    },
    
    initSession() {
        // 세션 ID 생성 또는 기존 세션 가져오기
        this.sessionId = sessionStorage.getItem('guide-session-id');
        if (!this.sessionId) {
            this.sessionId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            sessionStorage.setItem('guide-session-id', this.sessionId);
            
            // 새 세션 시작 - Analytics 이벤트
            Analytics.trackEvent('guide_started', {
                os: window.OSDetector?.getCurrentOS() || 'unknown',
                referrer: document.referrer || 'direct'
            });
        }
        
        // 시작 시간 기록
        this.startTime = sessionStorage.getItem('guide-start-time');
        if (!this.startTime) {
            this.startTime = Date.now();
            sessionStorage.setItem('guide-start-time', this.startTime);
        }
    },
    
    resetForOSChange() {
        // Reset progress
        this.currentStep = 0;
        this.completedSteps.clear();
        
        // Clear localStorage to ensure clean state
        localStorage.removeItem('claude-guide-progress');
        
        // Remove all expanded, active, completed classes
        document.querySelectorAll('.step-section').forEach(section => {
            section.classList.remove('expanded', 'active', 'completed', 'show-full');
            
            // Remove completed state UI elements
            const completedText = section.querySelector('.completed-text');
            if (completedText) {
                completedText.remove();
            }
            
            // Restore time estimate
            const readOnlyBtn = section.querySelector('.read-only-btn');
            if (readOnlyBtn) {
                const timeEstimate = readOnlyBtn.parentElement;
                const stepId = section.id.replace('step-', '');
                const timeText = this.getTimeEstimate(stepId);
                timeEstimate.innerHTML = `<i class="fas fa-clock"></i> ${timeText}`;
            }
            
            // Remove summary view
            const summary = section.querySelector('.step-summary');
            if (summary) {
                summary.remove();
            }
            
            // Remove back-to-summary button
            const backBtn = section.querySelector('.back-to-summary-btn');
            if (backBtn) {
                backBtn.remove();
            }
            
            // Remove show-full class to ensure content is hidden
            section.classList.remove('show-full');
            
            // Re-enable all buttons
            section.querySelectorAll('.result-btn').forEach(btn => {
                btn.disabled = false;
                btn.classList.remove('disabled', 'selected');
                btn.style.cursor = 'pointer';
                btn.style.opacity = '1';
                // Remove selected indicators
                btn.querySelectorAll('.selected-indicator, .selected-label').forEach(el => el.remove());
            });
        });
        
        // Remove all progress tags
        this.removeAllProgressTags();
        
        // Clear selected buttons
        this.selectedButtons = {};
        
        // Clear selectedEmoji if exists
        this.selectedEmoji = null;
    },
    
    getTimeEstimate(stepId) {
        const estimates = {
            'start': '2분',
            'Xcode': '1분~2시간',
            'node': '2분',
            'claude': '2분',
            'auth': '2분',
            'project': '3분',
            'start-windows': '2분',
            'git-windows': '5분',
            'node-windows': '3분',
            'claude-windows': '2분',
            'auth-windows': '2분',
            'project-windows': '3분'
        };
        return estimates[stepId] || '2분';
    },
    
    setupProgressBar() {
        const container = document.getElementById('progressSteps');
        if (!container) return;
        
        const os = window.OSDetector?.getCurrentOS() || 'mac';
        const total = this.totalSteps[os];
        
        container.innerHTML = '';
        for (let i = 0; i < total; i++) {
            const step = document.createElement('div');
            step.className = 'progress-step';
            step.addEventListener('click', () => this.goToStep(i));
            container.appendChild(step);
        }
    },
    
    setupResultButtons() {
        document.addEventListener('click', (e) => {
            if (e.target.closest('.result-btn')) {
                const button = e.target.closest('.result-btn');
                const step = button.getAttribute('data-step');
                const result = button.getAttribute('data-result');
                
                this.handleResultClick(step, result, button);
            }
        });
    },
    
    setupTroubleshooting() {
        // Mac type selector
        document.addEventListener('click', (e) => {
            if (e.target.closest('.mac-type-btn')) {
                const button = e.target.closest('.mac-type-btn');
                const type = button.getAttribute('data-type');
                
                // Update button states
                document.querySelectorAll('.mac-type-btn').forEach(btn => {
                    btn.classList.remove('active');
                });
                button.classList.add('active');
                
                // Show/hide solutions
                document.querySelectorAll('.mac-solution').forEach(solution => {
                    solution.classList.remove('active');
                });
                document.getElementById(`${type}-solution`)?.classList.add('active');
            }
        });
    },
    
    setupAccordion() {
        // Setup accordion functionality for step sections
        document.querySelectorAll('.step-header').forEach(header => {
            header.addEventListener('click', () => {
                const section = header.parentElement;
                
                // Only allow clicking on active or completed sections
                if (section.classList.contains('active') || section.classList.contains('completed')) {
                    section.classList.toggle('expanded');
                }
            });
        });
        
        // Don't auto-expand anything here - let updateProgress handle it
    },
    
    handleResultClick(step, result, button) {
        // Store selected button
        if (!this.selectedButtons) {
            this.selectedButtons = {};
        }
        this.selectedButtons[step] = result;
        
        if (result === 'success') {
            // Mark button as selected
            this.markButtonAsSelected(step, button);
            
            // Close current step
            const currentStepElement = document.getElementById(`step-${step}`);
            if (currentStepElement) {
                currentStepElement.classList.remove('expanded');
            }
            
            this.completeStep(step);
            this.hideTroubleshooting(step);
            this.goToNextStep();
        } else if (result === 'error') {
            // 에러 발생 기록
            if (!this.errorSteps.includes(step)) {
                this.errorSteps.push(step);
                
                // Analytics 에러 추적
                Analytics.trackEvent('error_occurred', {
                    step_name: step,
                    step_number: this.currentStep + 1,
                    os: window.OSDetector?.getCurrentOS() || 'unknown'
                });
            }
            this.showTroubleshooting(step);
        }
        
        // Visual feedback
        button.style.transform = 'scale(0.95)';
        setTimeout(() => {
            button.style.transform = '';
        }, 150);
    },
    
    markButtonAsSelected(step, button) {
        // Remove selected class from all buttons in this step
        const stepElement = document.getElementById(`step-${step}`);
        if (stepElement) {
            stepElement.querySelectorAll('.result-btn').forEach(btn => {
                btn.classList.remove('selected');
                btn.querySelectorAll('.selected-indicator, .selected-label').forEach(el => el.remove());
            });
        }
        
        // Add selected class and indicators to the clicked button
        button.classList.add('selected');
        
        // Add checkmark
        const indicator = document.createElement('div');
        indicator.className = 'selected-indicator';
        indicator.innerHTML = '✓';
        button.appendChild(indicator);
        
        // Add "선택됨" label
        const label = document.createElement('span');
        label.className = 'selected-label';
        label.textContent = '선택됨';
        button.appendChild(label);
    },
    
    disableNonSelectedButtons(stepSection, selectedResult) {
        // Disable all buttons that weren't selected in completed steps
        stepSection.querySelectorAll('.result-btn').forEach(btn => {
            if (btn.getAttribute('data-result') !== selectedResult) {
                btn.disabled = true;
                btn.classList.add('disabled');
                btn.style.cursor = 'not-allowed';
                btn.style.opacity = '0.5';
            }
        });
    },
    
    completeStep(step) {
        this.completedSteps.add(step);
        this.saveProgress();
        this.updateProgress();
        
        // Analytics 이벤트 추적
        Analytics.trackEvent('step_completed', {
            step_name: step,
            step_number: this.completedSteps.size,
            total_steps: this.totalSteps[window.OSDetector?.getCurrentOS() || 'mac']
        });
        
        // 1단계 완료 시 사용자 카운트 증가
        const stepNames = {
            'start': '시작하기 전에',
            'terminal': 'Terminal 사용법 익히기',
            'node': 'Node.js 설치',
            'start-windows': '시작하기 전에',
            'git-windows': 'Git 설치'
        };
        
        // 첫 번째 단계(시작하기 전에) 완료 시 카운트
        if ((step === 'start' || step === 'start-windows') && !this.hasCountedUser()) {
            this.incrementUserCount();
        }
        
        // Show success toast
        if (window.showToast) {
            const stepNames = {
                'start': '시작하기 전에',
            'terminal': 'Terminal 사용법 익히기',
                'node': 'Node.js 설치',
                'claude': 'Claude Code 설치',
                'auth': '인증 설정',
                'project': '첫 프로젝트',
                'start-windows': '시작하기 전에',
                'git-windows': 'Git for Windows 설치',
                'node-windows': 'Node.js 설치',
                'claude-windows': 'Claude Code 설치',
                'auth-windows': '인증 설정',
                'project-windows': '첫 프로젝트'
            };
            const stepName = stepNames[step] || '단계';
            // 첫 단계 완료 시 특별한 메시지
            if ((step === 'start' || step === 'start-windows') && !this.hasCountedUser()) {
                window.showToast(`🎉 ${stepName} 완료!`, 'success');
            } else {
                window.showToast(`${stepName} 완료!`, 'success');
            }
        }
        
        // Mark step as completed
        const stepSection = document.getElementById(`step-${step}`);
        if (stepSection) {
            stepSection.classList.add('completed');
            
            // Update step header for completed state
            const header = stepSection.querySelector('.step-header');
            if (header) {
                // Remove "여기에서 시작하세요" tag
                const startTag = header.querySelector('.step-tag');
                if (startTag && startTag.textContent.includes('여기에서 시작하세요')) {
                    startTag.remove();
                }
                
                // Add "(완료)" to title
                const title = header.querySelector('h2');
                if (title && !title.textContent.includes('(완료)')) {
                    title.innerHTML = title.textContent + ' <span class="completed-text">(완료)</span>';
                }
                
                // Replace time estimate with "읽기전용" button
                const timeEstimate = header.querySelector('.time-estimate');
                if (timeEstimate) {
                    timeEstimate.innerHTML = '<button class="read-only-btn">읽기전용</button>';
                }
            }
            
            // Add summary view
            if (!stepSection.querySelector('.step-summary')) {
                this.addSummaryView(stepSection, step);
            }
            
            // Close the completed step
            stepSection.classList.remove('expanded');
            
            // Restore selected button state for completed step
            if (this.selectedButtons && this.selectedButtons[step]) {
                const selectedResult = this.selectedButtons[step];
                const button = stepSection.querySelector(`.result-btn[data-result="${selectedResult}"]`);
                if (button && !button.classList.contains('selected')) {
                    this.markButtonAsSelected(step, button);
                }
                // Disable non-selected buttons
                this.disableNonSelectedButtons(stepSection, selectedResult);
            }
        }
    },
    
    goToNextStep() {
        const os = window.OSDetector?.getCurrentOS() || 'mac';
        const total = this.totalSteps[os];
        
        if (this.currentStep < total - 1) {
            // Remove "현재 진행 중" tag from all steps before moving to next
            this.removeAllProgressTags();
            
            this.currentStep++;
            this.saveProgress();
            this.updateProgress();
            
            // Get step IDs based on OS
            let stepIds;
            if (os === 'windows') {
                stepIds = ['start-windows', 'git-windows', 'node-windows', 'claude-windows', 'auth-windows', 'project-windows'];
            } else {
                stepIds = ['start', 'terminal', 'node', 'claude', 'auth', 'project'];
            }
            
            // Expand the next step and add "현재 진행 중" tag
            const nextStepId = stepIds[this.currentStep];
            if (nextStepId) {
                const nextStepElement = document.getElementById(`step-${nextStepId}`);
                if (nextStepElement) {
                    nextStepElement.classList.add('expanded');
                    
                    // Add "현재 진행 중" tag to the next step (only if it's not the first step)
                    if (this.currentStep > 0) {
                        const header = nextStepElement.querySelector('.step-header');
                        const stepNumber = header.querySelector('.step-number');
                        if (header && stepNumber && !header.querySelector('.progress-tag')) {
                            const progressTag = document.createElement('span');
                            progressTag.className = 'step-tag progress-tag';
                            progressTag.textContent = '현재 진행 중';
                            stepNumber.insertAdjacentElement('afterend', progressTag);
                        }
                    }
                }
            }
            
            this.scrollToCurrentStep();
        } else {
            // All steps completed
            const completionTime = this.startTime ? Math.round((Date.now() - this.startTime) / 1000 / 60) : 0;
            
            // Analytics 가이드 완료 이벤트
            Analytics.trackEvent('guide_completed', {
                completion_time_minutes: completionTime,
                error_count: this.errorSteps.length,
                os: window.OSDetector?.getCurrentOS() || 'unknown'
            });
            
            // 가이드 완료 카운터 증가
            const url = 'https://script.google.com/macros/s/AKfycbw9IG4a8jKUPG9s_ouhY6yk8xn3UUP-sDri8wDm9_WGct4cbGsWp6P1X45Ei5DUf-Q5/exec';
            fetch(`${url}?action=incrementCounter&metric=completions`, {
                method: 'GET',
                mode: 'no-cors'
            }).then(() => {
                console.log('가이드 완료 카운트 증가 요청 전송됨');
            });
            
            this.showCompletionModal();
        }
    },
    
    removeAllProgressTags() {
        document.querySelectorAll('.progress-tag').forEach(tag => tag.remove());
    },
    
    goToStep(stepIndex, skipSave = false) {
        this.currentStep = stepIndex;
        if (!skipSave) {
            this.saveProgress();
        }
        this.updateProgress();
        this.scrollToCurrentStep();
    },
    
    scrollToCurrentStep() {
        const os = window.OSDetector?.getCurrentOS() || 'mac';
        let steps, suffix;
        
        if (os === 'windows') {
            steps = ['start-windows', 'git-windows', 'node-windows', 'claude-windows', 'auth-windows', 'project-windows'];
            suffix = '';
        } else {
            steps = ['start', 'terminal', 'node', 'claude', 'auth', 'project'];
            suffix = '';
        }
        
        const stepId = steps[this.currentStep];
        const stepElement = document.getElementById(`step-${stepId}`);
        
        if (stepElement) {
            stepElement.scrollIntoView({ 
                behavior: 'smooth',
                block: 'start'
            });
        }
    },
    
    updateProgress() {
        const os = window.OSDetector?.getCurrentOS() || 'mac';
        const total = this.totalSteps[os];
        const completed = this.completedSteps.size;
        const percentage = Math.round((completed / total) * 100);
        
        // Update progress bar
        const progressFill = document.getElementById('progressFill');
        if (progressFill) {
            progressFill.style.width = `${percentage}%`;
        }
        
        // Update progress text
        const progressText = document.getElementById('progressText');
        if (progressText) {
            progressText.textContent = `${percentage}% 완료 (${completed}/${total})`;
        }
        
        // Update current step text
        const progressTime = document.querySelector('.progress-time');
        if (progressTime) {
            const stepNames = {
                'start': '시작하기 전에',
                'terminal': 'Terminal 사용법 익히기',
                'node': 'Node.js 설치',
                'claude': 'Claude Code 설치',
                'auth': '인증 설정',
                'project': '첫 프로젝트',
                'start-windows': '시작하기 전에',
                'git-windows': 'Git for Windows 설치',
                'node-windows': 'Node.js 설치',
                'claude-windows': 'Claude Code 설치',
                'auth-windows': '인증 설정',
                'project-windows': '첫 프로젝트'
            };
            
            const currentStepId = os === 'windows' ? 
                ['start-windows', 'git-windows', 'node-windows', 'claude-windows', 'auth-windows', 'project-windows'][this.currentStep] :
                ['start', 'terminal', 'node', 'claude', 'auth', 'project'][this.currentStep];
            
            const currentStepName = stepNames[currentStepId] || '시작하기 전에';
            progressTime.textContent = `현재: ${currentStepName}`;
        }
        
        // Update step indicators
        const stepElements = document.querySelectorAll('.progress-step');
        stepElements.forEach((step, index) => {
            step.classList.remove('active', 'completed');
            
            if (index < completed) {
                step.classList.add('completed');
            } else if (index === this.currentStep) {
                step.classList.add('active');
            }
        });
        
        // Update step sections
        let stepIds;
        
        if (os === 'windows') {
            stepIds = ['start-windows', 'git-windows', 'node-windows', 'claude-windows', 'auth-windows', 'project-windows'];
        } else {
            stepIds = ['start', 'terminal', 'node', 'claude', 'auth', 'project'];
        }
        
        // Remove active from all sections and remove all progress tags
        document.querySelectorAll('.step-section').forEach(section => {
            section.classList.remove('active');
        });
        this.removeAllProgressTags();
        
        // Add active to current step and expand it
        const currentStepId = stepIds[this.currentStep];
        if (currentStepId) {
            const currentStepElement = document.getElementById(`step-${currentStepId}`);
            if (currentStepElement) {
                currentStepElement.classList.add('active');
                
                // Only expand if not completed
                if (!currentStepElement.classList.contains('completed')) {
                    currentStepElement.classList.add('expanded');
                    
                    // Add "현재 진행 중" tag if not already present (but not for the first step)
                    if (this.currentStep > 0) {
                        const header = currentStepElement.querySelector('.step-header');
                        const stepNumber = header?.querySelector('.step-number');
                        if (header && stepNumber && !header.querySelector('.progress-tag')) {
                            const progressTag = document.createElement('span');
                            progressTag.className = 'step-tag progress-tag';
                            progressTag.textContent = '현재 진행 중';
                            stepNumber.insertAdjacentElement('afterend', progressTag);
                        }
                    }
                }
            }
        }
    },
    
    showTroubleshooting(step) {
        const troubleshooting = document.getElementById(`troubleshooting-${step}`);
        if (troubleshooting) {
            troubleshooting.classList.add('active');
            
            // 기본적으로 Apple Silicon 솔루션을 표시 (이미 HTML에서 active 클래스 추가됨)
            // 추가 로직이 필요한 경우 여기에 작성
        }
    },
    
    hideTroubleshooting(step) {
        const troubleshooting = document.getElementById(`troubleshooting-${step}`);
        if (troubleshooting) {
            troubleshooting.classList.remove('active');
        }
    },
    
    showCompletionModal() {
        // Create and show completion modal
        const modal = document.createElement('div');
        modal.className = 'completion-modal';
        modal.innerHTML = `
            <div class="modal-content modal-content-split">
                <button class="modal-close-btn" onclick="GuideManager.closeCompletionModal()">
                    <i class="fas fa-times"></i>
                </button>
                
                <div class="modal-split-layout">
                    <div class="modal-left-section">
                        <div class="modal-icon">🎉</div>
                        <h2>축하합니다!</h2>
                        <p>Claude Code 가족이 되신 것을 환영합니다!</p>
                        <p class="modal-subtitle">터미널에 <code>claude</code> 입력하고 작게라도 만들어보세요!</p>
                        
                        <button class="docs-link-btn" onclick="window.open('https://docs.anthropic.com/en/docs/claude-code', '_blank')">
                            <i class="fas fa-book"></i>
                            공식문서 보기
                        </button>
                        
                        <div class="feedback-emoji-section">
                            <p class="feedback-question">오늘 경험은 어떠셨나요?</p>
                            <div class="emoji-options">
                                <button class="emoji-btn" data-emoji="love" onclick="GuideManager.handleEmojiClick('love')">
                                    <span class="emoji">😍</span>
                                    <span class="emoji-label">최고예요</span>
                                </button>
                                <button class="emoji-btn" data-emoji="good" onclick="GuideManager.handleEmojiClick('good')">
                                    <span class="emoji">😊</span>
                                    <span class="emoji-label">좋아요</span>
                                </button>
                                <button class="emoji-btn" data-emoji="neutral" onclick="GuideManager.handleEmojiClick('neutral')">
                                    <span class="emoji">😐</span>
                                    <span class="emoji-label">보통이에요</span>
                                </button>
                                <button class="emoji-btn" data-emoji="sad" onclick="GuideManager.handleEmojiClick('sad')">
                                    <span class="emoji">😕</span>
                                    <span class="emoji-label">아쉬워요</span>
                                </button>
                            </div>
                        </div>
                    </div>
                    
                    <div class="modal-right-section" id="feedbackDetailSection" style="display: none;">
                        <div class="feedback-detail">
                            <h3 id="feedbackTitle">한 마디 남겨주실래요?</h3>
                            <p id="feedbackSubtitle">여러분의 소중한 의견이 큰 힘이 됩니다</p>
                            <textarea 
                                id="feedbackText" 
                                placeholder="어떤 점이 좋았나요? 또는 어떤 점이 아쉬웠나요?"
                                rows="6"
                            ></textarea>
                            <button class="feedback-submit-btn" onclick="GuideManager.submitFeedback()">
                                <i class="fas fa-paper-plane"></i>
                                전송하기
                            </button>
                        </div>
                    </div>
                </div>
                
                <div class="modal-share-section">
                    <p class="share-question">이 사이트를 친구에게 추천하시겠어요?</p>
                    <div class="share-content">
                        <div class="share-url">https://claude-code-guide-nu.vercel.app/</div>
                        <button class="share-btn" onclick="GuideManager.handleShare()">
                            <i class="fas fa-share"></i>
                            공유하기
                        </button>
                    </div>
                </div>
                
                <button class="btn-text-secondary" onclick="GuideManager.closeCompletionModal()">
                    나중에 하기
                </button>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Show modal with animation
        setTimeout(() => {
            modal.classList.add('show');
        }, 100);
        
        // Close modal when clicking outside
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                this.closeCompletionModal();
            }
        });
    },
    
    
    handleEmojiClick(emoji) {
        // Remove selected class from all emoji buttons
        document.querySelectorAll('.emoji-btn').forEach(btn => {
            btn.classList.remove('selected');
        });
        
        // Add selected class to clicked button
        const clickedBtn = document.querySelector(`.emoji-btn[data-emoji="${emoji}"]`);
        if (clickedBtn) {
            clickedBtn.classList.add('selected');
        }
        
        // Store selected emoji
        this.selectedEmoji = emoji;
        
        // Show feedback detail section for extreme reactions
        const feedbackSection = document.getElementById('feedbackDetailSection');
        const feedbackTitle = document.getElementById('feedbackTitle');
        const feedbackSubtitle = document.getElementById('feedbackSubtitle');
        const feedbackTextarea = document.getElementById('feedbackText');
        
        const modalContent = document.querySelector('.modal-content-split');
        
        if (emoji === 'love' || emoji === 'sad') {
            feedbackSection.style.display = 'block';
            modalContent?.classList.add('expanded');
            
            if (emoji === 'love') {
                feedbackTitle.textContent = '정말 기쁘네요! 한 마디 남겨주실래요?';
                feedbackSubtitle.textContent = '어떤 점이 가장 좋으셨나요?';
                feedbackTextarea.placeholder = '어떤 점이 좋았나요?';
            } else {
                feedbackTitle.textContent = '아쉬우셨군요. 의견을 들려주실래요?';
                feedbackSubtitle.textContent = '어떤 점을 개선하면 좋을까요?';
                feedbackTextarea.placeholder = '어떤 점이 아쉬웠나요?';
            }
        } else {
            feedbackSection.style.display = 'none';
            modalContent?.classList.remove('expanded');
        }
        
        // Log emoji feedback
        console.log('User feedback emoji:', emoji);
        
        // Analytics 이모지 피드백 추적
        Analytics.trackEvent('feedback_emoji_selected', {
            emoji: emoji,
            completion_time: this.startTime ? Math.round((Date.now() - this.startTime) / 1000 / 60) : 0
        });
        
        // 이모지만 선택한 경우에도 기본 데이터 전송 (good, neutral의 경우)
        if (emoji === 'good' || emoji === 'neutral') {
            // 프록시 서버를 통한 POST 요청
            fetch('/api/feedback', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    emoji: emoji,
                    feedbackText: '',
                    email: '',
                    userId: Analytics.getUserId ? Analytics.getUserId() : '',
                    sessionId: this.sessionId
                })
            })
            .then(response => response.json())
            .then(result => {
                if (result.success) {
                    console.log('Emoji feedback sent successfully');
                } else {
                    throw new Error(result.error || 'Failed to submit emoji feedback');
                }
            })
            .catch(err => {
                console.error('Failed to send emoji feedback:', err);
                // 실패 시 GET 방식으로 폴백
                const params = new URLSearchParams({
                    eventType: 'feedback_submitted',
                    userId: Analytics.getUserId ? Analytics.getUserId() : '',
                    sessionId: this.sessionId,
                    emoji: emoji,
                    feedbackText: '',
                    timestamp: new Date().toISOString()
                });
                
                const url = `https://script.google.com/macros/s/AKfycbw9IG4a8jKUPG9s_ouhY6yk8xn3UUP-sDri8wDm9_WGct4cbGsWp6P1X45Ei5DUf-Q5/exec?${params.toString()}`;
                
                fetch(url, { mode: 'no-cors' })
                    .then(() => console.log('Emoji feedback sent via fallback'))
                    .catch(err => console.error('Fallback also failed:', err));
            });
        }
    },
    
    async submitFeedback() {
        const feedbackText = document.getElementById('feedbackText').value.trim();
        if (!feedbackText) return;
        
        // Log feedback
        console.log('User feedback:', {
            emoji: this.selectedEmoji,
            feedbackText: feedbackText
        });
        
        try {
            // 프록시 서버를 통한 POST 요청
            const response = await fetch('/api/feedback', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    emoji: this.selectedEmoji,
                    feedbackText: feedbackText,
                    email: '', // 나중에 이메일 입력 필드 추가 시 사용
                    userId: Analytics.getUserId ? Analytics.getUserId() : '',
                    sessionId: this.sessionId
                })
            });

            const result = await response.json();
            
            if (result.success) {
                // Show success message
                const feedbackSection = document.getElementById('feedbackDetailSection');
                feedbackSection.innerHTML = `
                    <div class="feedback-success">
                        <i class="fas fa-check-circle"></i>
                        <h3>감사합니다!</h3>
                        <p>소중한 의견 잘 받았습니다</p>
                    </div>
                `;
                
                console.log('Feedback submitted successfully:', result);
            } else {
                throw new Error(result.error || 'Failed to submit feedback');
            }
            
        } catch (error) {
            console.error('Failed to send feedback:', error);
            
            // 실패 시 기존 GET 방식으로 폴백
            const params = new URLSearchParams({
                eventType: 'feedback_submitted',
                userId: Analytics.getUserId ? Analytics.getUserId() : '',
                sessionId: this.sessionId,
                emoji: this.selectedEmoji,
                feedbackText: feedbackText,
                timestamp: new Date().toISOString()
            });
            
            const url = `https://script.google.com/macros/s/AKfycbw9IG4a8jKUPG9s_ouhY6yk8xn3UUP-sDri8wDm9_WGct4cbGsWp6P1X45Ei5DUf-Q5/exec?${params.toString()}`;
            
            fetch(url, { mode: 'no-cors' })
                .then(() => console.log('Feedback sent via fallback'))
                .catch(err => console.error('Fallback also failed:', err));
        }
        
        // Analytics 상세 피드백 추적
        Analytics.trackEvent('feedback_submitted', {
            emoji: this.selectedEmoji,
            has_text: feedbackText.length > 0,
            text_length: feedbackText.length
        });
    },
    
    handleShare() {
        const shareBtn = document.querySelector('.share-btn');
        const shareMenu = document.querySelector('.share-menu');
        
        // Toggle share menu visibility
        if (shareMenu) {
            shareMenu.classList.toggle('show');
            shareBtn.classList.toggle('active');
        } else {
            this.createShareMenu();
        }
    },
    
    createShareMenu() {
        const shareContent = document.querySelector('.share-content');
        const shareMenu = document.createElement('div');
        shareMenu.className = 'share-menu';
        shareMenu.innerHTML = `
            <div class="share-menu-item" data-action="copy">
                <i class="fas fa-copy"></i>
                <span>링크 복사</span>
            </div>
            <div class="share-menu-item" data-action="twitter">
                <i class="fab fa-twitter"></i>
                <span>트위터</span>
            </div>
            <div class="share-menu-item" data-action="facebook">
                <i class="fab fa-facebook-f"></i>
                <span>페이스북</span>
            </div>
            <div class="share-menu-item" data-action="linkedin">
                <i class="fab fa-linkedin-in"></i>
                <span>링크드인</span>
            </div>
        `;
        
        shareContent.appendChild(shareMenu);
        
        // Add event listeners
        shareMenu.querySelectorAll('.share-menu-item').forEach(item => {
            item.addEventListener('click', (e) => {
                const action = e.currentTarget.dataset.action;
                this.handleShareAction(action);
            });
        });
        
        // Show menu
        setTimeout(() => {
            shareMenu.classList.add('show');
            document.querySelector('.share-btn').classList.add('active');
            
            // Adjust position if menu goes off-screen
            const menuRect = shareMenu.getBoundingClientRect();
            const windowWidth = window.innerWidth;
            
            if (menuRect.right > windowWidth - 20) {
                shareMenu.style.right = '0';
                shareMenu.style.left = 'auto';
                shareMenu.style.transform = 'translateX(-20px)';
            }
        }, 10);
        
        // Close menu when clicking outside
        document.addEventListener('click', (e) => {
            if (!shareContent.contains(e.target)) {
                shareMenu.classList.remove('show');
                document.querySelector('.share-btn').classList.remove('active');
            }
        });
    },
    
    handleShareAction(action) {
        const url = 'https://claude-code-guide-nu.vercel.app/';
        const title = 'Claude Code Guide - 초보자를 위한 바이브 코딩의 시작';
        const text = 'Claude Code를 6단계로 간단하게 설치하세요. 터미널이 처음이어도 걱정 없습니다!';
        
        switch (action) {
            case 'copy':
                this.copyToClipboard(url);
                break;
            case 'twitter':
                this.shareToTwitter(url, text);
                break;
            case 'facebook':
                this.shareToFacebook(url);
                break;
            case 'linkedin':
                this.shareToLinkedIn(url, title, text);
                break;
        }
        
        // Hide menu after action
        const shareMenu = document.querySelector('.share-menu');
        shareMenu.classList.remove('show');
        document.querySelector('.share-btn').classList.remove('active');
    },
    
    copyToClipboard(url) {
        navigator.clipboard.writeText(url).then(() => {
            if (window.showToast) {
                window.showToast('링크가 복사되었습니다!', 'success');
            }
        }).catch(err => {
            console.error('Failed to copy:', err);
            if (window.showToast) {
                window.showToast('복사에 실패했습니다', 'error');
            }
        });
    },
    
    shareToTwitter(url, text) {
        const twitterUrl = `https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
        window.open(twitterUrl, '_blank', 'width=550,height=420');
    },
    
    shareToFacebook(url) {
        const facebookUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
        window.open(facebookUrl, '_blank', 'width=550,height=420');
    },
    
    shareToLinkedIn(url, title, text) {
        const linkedinUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}&title=${encodeURIComponent(title)}&summary=${encodeURIComponent(text)}`;
        window.open(linkedinUrl, '_blank', 'width=550,height=420');
    },
    
    closeCompletionModal() {
        const modal = document.querySelector('.completion-modal');
        if (modal) {
            modal.classList.remove('show');
            setTimeout(() => {
                modal.remove();
            }, 300);
        }
    },
    
    saveProgress() {
        const os = window.OSDetector?.getCurrentOS() || 'mac';
        const progress = {
            os: os,
            currentStep: this.currentStep,
            completedSteps: Array.from(this.completedSteps),
            selectedButtons: this.selectedButtons || {},
            timestamp: Date.now()
        };
        
        localStorage.setItem('claude-guide-progress', JSON.stringify(progress));
        
        // Only update URL if there's actual progress
        if (this.currentStep > 0 || this.completedSteps.size > 0) {
            const url = new URL(window.location);
            
            // Convert to human-readable step numbers (1-based instead of 0-based)
            url.searchParams.set('current', this.currentStep + 1);
            
            // Create done range (e.g., "1-3" for steps 0,1,2)
            if (this.completedSteps.size > 0) {
                const completedArray = Array.from(this.completedSteps);
                const stepIndices = this.getStepIndices(completedArray);
                if (stepIndices.length > 0) {
                    const minStep = Math.min(...stepIndices) + 1;
                    const maxStep = Math.max(...stepIndices) + 1;
                    url.searchParams.set('done', minStep === maxStep ? `${minStep}` : `${minStep}-${maxStep}`);
                }
            }
            
            window.history.replaceState({}, '', url);
        }
    },
    
    getStepIndices(stepIds) {
        const os = window.OSDetector?.getCurrentOS() || 'mac';
        let stepIdArray;
        
        if (os === 'windows') {
            stepIdArray = ['start-windows', 'git-windows', 'node-windows', 'claude-windows', 'auth-windows', 'project-windows'];
        } else {
            stepIdArray = ['start', 'terminal', 'node', 'claude', 'auth', 'project'];
        }
        
        return stepIds.map(id => stepIdArray.indexOf(id)).filter(index => index !== -1);
    },
    
    loadProgress() {
        // Load from URL first
        const urlParams = new URLSearchParams(window.location.search);
        const currentParam = urlParams.get('current');
        const doneParam = urlParams.get('done');
        
        // Also check old format for backward compatibility
        const oldStepParam = urlParams.get('step');
        const oldCompletedParam = urlParams.get('completed');
        
        if (currentParam !== null) {
            // New format: current is 1-based, so convert to 0-based
            this.currentStep = (parseInt(currentParam) || 1) - 1;
        } else if (oldStepParam !== null) {
            // Old format: already 0-based
            this.currentStep = parseInt(oldStepParam) || 0;
        }
        
        const os = window.OSDetector?.getCurrentOS() || 'mac';
        let stepIdArray;
        
        if (os === 'windows') {
            stepIdArray = ['start-windows', 'git-windows', 'node-windows', 'claude-windows', 'auth-windows', 'project-windows'];
        } else {
            stepIdArray = ['start', 'terminal', 'node', 'claude', 'auth', 'project'];
        }
        
        if (doneParam) {
            // New format: "1-3" or "1"
            const parts = doneParam.split('-');
            if (parts.length === 2) {
                // Range format: "1-3"
                const start = parseInt(parts[0]) - 1; // Convert to 0-based
                const end = parseInt(parts[1]) - 1;   // Convert to 0-based
                this.completedSteps = new Set();
                for (let i = start; i <= end && i < stepIdArray.length; i++) {
                    this.completedSteps.add(stepIdArray[i]);
                }
            } else {
                // Single number: "1"
                const index = parseInt(parts[0]) - 1; // Convert to 0-based
                if (index >= 0 && index < stepIdArray.length) {
                    this.completedSteps = new Set([stepIdArray[index]]);
                }
            }
        } else if (oldCompletedParam) {
            // Old format: comma-separated step IDs
            const completed = oldCompletedParam.split(',').filter(s => s).map(s => s.trim());
            this.completedSteps = new Set(completed);
        }
        
        // Load selected buttons from localStorage if we have URL params
        if (currentParam !== null || doneParam || oldStepParam !== null || oldCompletedParam) {
            const saved = localStorage.getItem('claude-guide-progress');
            if (saved) {
                try {
                    const progress = JSON.parse(saved);
                    this.selectedButtons = progress.selectedButtons || {};
                } catch (e) {
                    console.warn('Failed to load selected buttons:', e);
                }
            }
        }
        
        // If no URL params, start fresh (ignore localStorage)
        if (!currentParam && !doneParam && oldStepParam === null && !oldCompletedParam) {
            this.currentStep = 0;
            this.completedSteps = new Set();
            this.selectedButtons = {};
        }
        
        // Apply completed state UI updates
        this.applyCompletedStatesUI();
    },
    
    applyCompletedStatesUI() {
        // Apply UI changes for all completed steps
        const os = window.OSDetector?.getCurrentOS() || 'mac';
        let stepIds;
        
        if (os === 'windows') {
            stepIds = ['start-windows', 'git-windows', 'node-windows', 'claude-windows', 'auth-windows', 'project-windows'];
        } else {
            stepIds = ['start', 'terminal', 'node', 'claude', 'auth', 'project'];
        }
        
        this.completedSteps.forEach(stepId => {
            const stepSection = document.getElementById(`step-${stepId}`);
            if (stepSection) {
                stepSection.classList.add('completed');
                
                // Update step header for completed state
                const header = stepSection.querySelector('.step-header');
                if (header) {
                    // Remove "여기에서 시작하세요" tag
                    const startTag = header.querySelector('.step-tag');
                    if (startTag && startTag.textContent.includes('여기에서 시작하세요')) {
                        startTag.remove();
                    }
                    
                    // Add "(완료)" to title
                    const title = header.querySelector('h2');
                    if (title && !title.textContent.includes('(완료)')) {
                        title.innerHTML = title.textContent + ' <span class="completed-text">(완료)</span>';
                    }
                    
                    // Replace time estimate with "읽기전용" button
                    const timeEstimate = header.querySelector('.time-estimate');
                    if (timeEstimate) {
                        timeEstimate.innerHTML = '<button class="read-only-btn">읽기전용</button>';
                    }
                }
                
                // Make sure completed steps are not expanded
                stepSection.classList.remove('expanded');
                
                // Add summary view if not already present
                if (!stepSection.querySelector('.step-summary')) {
                    this.addSummaryView(stepSection, stepId);
                }
                
                // Restore selected button state
                if (this.selectedButtons && this.selectedButtons[stepId]) {
                    const selectedResult = this.selectedButtons[stepId];
                    const button = stepSection.querySelector(`.result-btn[data-result="${selectedResult}"]`);
                    if (button) {
                        this.markButtonAsSelected(stepId, button);
                    }
                    // Disable non-selected buttons in completed steps
                    this.disableNonSelectedButtons(stepSection, selectedResult);
                }
            }
        });
    },
    
    addSummaryView(stepSection, stepId) {
        const summaryData = this.getSummaryData(stepId);
        if (!summaryData) return;
        
        const summaryDiv = document.createElement('div');
        summaryDiv.className = 'step-summary';
        summaryDiv.innerHTML = `
            <div class="step-summary-content">
                <i class="fas fa-check-circle step-summary-icon"></i>
                <div class="step-summary-text">${summaryData.text}</div>
            </div>
            <button class="view-full-content-btn">
                <i class="fas fa-expand"></i>
                전체 내용 다시 보기
            </button>
        `;
        
        // Insert after header
        const header = stepSection.querySelector('.step-header');
        header.insertAdjacentElement('afterend', summaryDiv);
        
        // Add "back to summary" button to content if not already present
        const stepContent = stepSection.querySelector('.step-content');
        if (stepContent && !stepContent.querySelector('.back-to-summary-btn')) {
            const backBtn = document.createElement('button');
            backBtn.className = 'back-to-summary-btn';
            backBtn.innerHTML = `
                <i class="fas fa-compress"></i>
                요약으로 돌아가기
            `;
            stepContent.insertAdjacentElement('afterbegin', backBtn);
            
            // Add click handler to back button
            backBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                stepSection.classList.remove('show-full');
            });
        }
        
        // Add click handler to view full button
        const viewFullBtn = summaryDiv.querySelector('.view-full-content-btn');
        viewFullBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            stepSection.classList.add('show-full');
        });
    },
    
    getSummaryData(stepId) {
        const summaries = {
            'start': { text: '터미널 사용법 숙지 완료 • 기본 명령어 이해' },
            'start-windows': { text: '터미널 사용법 숙지 완료 • 기본 명령어 이해' },
            'terminal': { text: 'Terminal 사용법 숙지 완료' },
            'git-windows': { text: 'Git for Windows 설치 완료' },
            'node': { text: 'Node.js 및 npm 설치 완료' },
            'node-windows': { text: 'Node.js 및 npm 설치 완료' },
            'claude': { text: 'Claude Code CLI 설치 완료' },
            'claude-windows': { text: 'Claude Code CLI 설치 완료' },
            'auth': { text: 'Anthropic API 키 설정 완료' },
            'auth-windows': { text: 'Anthropic API 키 설정 완료' },
            'project': { text: '첫 프로젝트 생성 및 실행 완료' },
            'project-windows': { text: '첫 프로젝트 생성 및 실행 완료' }
        };
        
        return summaries[stepId];
    },
    
    resetProgress() {
        this.currentStep = 0;
        this.completedSteps.clear();
        
        // Clear URL parameters except OS
        const url = new URL(window.location);
        url.searchParams.delete('step');
        url.searchParams.delete('completed');
        window.history.replaceState({}, '', url);
        
        // Clear localStorage
        localStorage.removeItem('claude-guide-progress');
        
        this.setupProgressBar();
        this.updateProgress();
        
        // Remove completed states
        document.querySelectorAll('.step-section').forEach(section => {
            section.classList.remove('completed');
        });
        
        // Hide troubleshooting
        document.querySelectorAll('.troubleshooting').forEach(troubleshooting => {
            troubleshooting.classList.remove('active');
        });
    },
    
    
    getBrowserInfo() {
        const userAgent = navigator.userAgent;
        if (userAgent.includes('Chrome')) return 'Chrome';
        if (userAgent.includes('Safari')) return 'Safari';
        if (userAgent.includes('Firefox')) return 'Firefox';
        if (userAgent.includes('Edge')) return 'Edge';
        return 'Other';
    },
    
    // 만족도 표시 초기화
    async initSatisfactionDisplay() {
        // 즉시 기본 메시지 표시
        this.showDefaultMessage();
        
        try {
            // 백그라운드에서 데이터 가져오기
            const totalUsers = await this.getTotalUsers();
            const satisfactionData = await this.getSatisfactionData();
            
            // 데이터가 있으면 업데이트
            if (totalUsers > 0) {
                this.updateSatisfactionDisplay(totalUsers, satisfactionData);
            }
        } catch (error) {
            console.error('만족도 표시 초기화 실패:', error);
            // 에러 발생 시 기본 메시지 유지
        }
    },
    
    showDefaultMessage() {
        const display = document.getElementById('satisfactionDisplay');
        const text = document.getElementById('satisfactionText');
        
        if (!display || !text) return;
        
        // 기본 메시지 즉시 표시
        text.innerHTML = '📝 아래 단계별 가이드를 따라하시면 설치할 수 있습니다';
        display.className = 'satisfaction-display stage-new';
        display.style.display = 'block';
        display.classList.add('show');
    },
    
    async getTotalUsers() {
        // Google Sheets에서 사용자 수 가져오기
        try {
            const { Analytics } = await import('./analytics.js');
            const response = await fetch(Analytics.APPS_SCRIPT_URL + '?action=getCounter&metric=users');
            const data = await response.json();
            return data.value || 0;
        } catch (error) {
            console.error('사용자 수 가져오기 실패:', error);
            return 0;
        }
    },
    
    async getSatisfactionData() {
        try {
            // Google Sheets에서 만족도 데이터 가져오기
            const response = await fetch(`${this.SHEET_URL}?action=getSatisfactionData`);
            
            // 텍스트로 응답 받기 (CORS 모드로 인해 JSON 파싱 불가)
            const text = await response.text();
            
            // 응답이 JSON 형식인지 확인
            try {
                const data = JSON.parse(text);
                return data;
            } catch {
                // JSON 파싱 실패 시 기본값 반환
                return {
                    love: 0,
                    good: 0,
                    neutral: 0,
                    sad: 0,
                    total: 0
                };
            }
        } catch (error) {
            console.error('만족도 데이터 가져오기 실패:', error);
            // 오류 시 기본값 반환
            return {
                love: 0,
                good: 0,
                neutral: 0,
                sad: 0,
                total: 0
            };
        }
    },
    
    updateSatisfactionDisplay(totalUsers, satisfactionData) {
        const display = document.getElementById('satisfactionDisplay');
        const text = document.getElementById('satisfactionText');
        
        if (!display || !text) return;
        
        let message = '';
        let stageClass = '';
        
        if (totalUsers < 10 || satisfactionData.total === 0) {
            // 초기 단계 - 데이터가 충분하지 않을 때
            message = '📝 아래 단계별 가이드를 따라하시면 설치할 수 있습니다';
            stageClass = 'stage-new';
        } else if (totalUsers < 100) {
            // 성장 단계 - 실제 만족도 데이터 표시
            const satisfactionRate = satisfactionData.total > 0 
                ? Math.round((satisfactionData.love + satisfactionData.good) / satisfactionData.total * 100)
                : 0;
            
            if (satisfactionRate > 0) {
                message = `<span class="number">${satisfactionRate}%</span>의 사용자가 만족했어요 😊`;
                stageClass = 'stage-growing';
            } else {
                message = '📝 아래 단계별 가이드를 따라하시면 설치할 수 있습니다';
                stageClass = 'stage-new';
            }
        } else {
            // 성숙 단계 - 전체 사용자 수와 만족도 함께 표시
            const satisfactionRate = satisfactionData.total > 0 
                ? Math.round((satisfactionData.love + satisfactionData.good) / satisfactionData.total * 100)
                : 0;
            const satisfied = Math.round(totalUsers * satisfactionRate / 100);
            
            message = `<span class="number">${totalUsers}</span>명 중 <span class="number">${satisfied}</span>명이 만족했어요 👍`;
            stageClass = 'stage-mature';
        }
        
        // 업데이트
        text.innerHTML = message;
        display.className = `satisfaction-display ${stageClass}`;
        
        // 애니메이션과 함께 표시
        setTimeout(() => {
            display.style.display = 'block';
            display.classList.add('show');
        }, 500);
    },
    
    // 사용자 카운트 관련 메서드들
    hasCountedUser() {
        return localStorage.getItem('claude-guide-counted') === 'true';
    },
    
    markUserCounted() {
        localStorage.setItem('claude-guide-counted', 'true');
        localStorage.setItem('claude-guide-counted-date', new Date().toISOString());
    },
    
    async incrementUserCount() {
        try {
            // Google Sheets를 사용하여 카운트 증가
            const url = 'https://script.google.com/macros/s/AKfycbw9IG4a8jKUPG9s_ouhY6yk8xn3UUP-sDri8wDm9_WGct4cbGsWp6P1X45Ei5DUf-Q5/exec';
            
            // 사용자 카운트 증가
            fetch(`${url}?action=incrementCounter&metric=users`, {
                method: 'GET',
                mode: 'no-cors'
            }).then(() => {
                console.log('사용자 카운트 증가 요청 전송됨');
            });
            
            // 가이드 시작 카운터도 증가
            fetch(`${url}?action=incrementCounter&metric=starts`, {
                method: 'GET',
                mode: 'no-cors'
            }).then(() => {
                console.log('가이드 시작 카운트 증가 요청 전송됨');
            });
            
            // 로컬에 카운트 완료 표시
            this.markUserCounted();
            
        } catch (error) {
            console.error('사용자 카운트 실패:', error);
            // 실패해도 로컬에는 표시하여 중복 카운트 방지
            this.markUserCounted();
        }
    }
};

// Global functions for HTML onclick (원본 호환성)
window.handleResultClick = function(step, result, button) {
    GuideManager.handleResultClick(step, result, button);
};

window.handleResolutionClick = function(element, step) {
    if (!element.classList.contains('resolved')) {
        element.classList.add('resolved');
        const icon = element.querySelector('.resolution-check-icon i');
        if (icon) {
            icon.style.display = 'block';
        }
        
        // Mark the error button as selected if it's not already selected
        const stepElement = document.getElementById(`step-${step}`);
        if (stepElement) {
            const errorButton = stepElement.querySelector('.result-btn.error');
            if (errorButton && !GuideManager.selectedButtons[step]) {
                GuideManager.markButtonAsSelected(step, errorButton);
                GuideManager.selectedButtons[step] = 'error';
            }
        }
        
        // Complete the step and go to next
        setTimeout(() => {
            GuideManager.completeStep(step);
            GuideManager.hideTroubleshooting(step);
            GuideManager.goToNextStep();
        }, 500);
        
        // Hide troubleshooting after resolution
        setTimeout(() => {
            const troubleshooting = document.getElementById(`troubleshooting-${step}`);
            if (troubleshooting) {
                troubleshooting.classList.remove('active');
            }
        }, 1000);
    }
};

window.toggleOS = function() {
    window.OSDetector.toggleOS();
};

window.toggleTheme = function() {
    window.ThemeManager.toggle();
};

// Make GuideManager globally available
window.GuideManager = GuideManager;