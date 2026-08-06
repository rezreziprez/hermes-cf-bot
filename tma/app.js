// Hermes AI Hub - Telegram Mini App
// Main Application Logic

// ========== CONFIGURATION ==========
const CONFIG = {
  // Backend API URL (your Cloudflare Worker)
  API_URL: 'https://hermes-bot.r65.workers.dev',
  
  // Available AI Models
  models: [
    { id: 'gemini/gemini-3.5-flash-lite', name: 'Gemini Flash Lite', icon: '⚡', type: 'Fast & Free', category: 'text' },
    { id: 'Xk/qwen/qwen3.8-max', name: 'Qwen 3.8 Max', icon: '🧠', type: 'Smart Reasoning', category: 'text' },
    { id: 'Xk/deepseek/deepseek-v4-flash', name: 'DeepSeek V4', icon: '💻', type: 'Code Expert', category: 'code' },
    { id: 'Xk/xiaomi/mimo-v2.5:free', name: 'MiMo V2.5', icon: '🤖', type: 'Free Model', category: 'text' },
    { id: 'gemini/gemma-4-31b-it', name: 'Gemma 4 31B', icon: '💎', type: 'Google Model', category: 'text' },
    { id: 'flux', name: 'Flux Image', icon: '🎨', type: 'Image Generation', category: 'image' },
    { id: 'flux-realism', name: 'Flux Realistic', icon: '📸', type: 'Realistic Photos', category: 'image' },
    { id: 'flux-anime', name: 'Flux Anime', icon: '🎌', type: 'Anime Style', category: 'image' },
  ],
  
  // Default model
  defaultModel: 'gemini/gemini-3.5-flash-lite',
  
  // Image generation
  imageEndpoint: 'https://image.pollinations.ai/prompt/',
};

// ========== STATE ==========
let state = {
  currentModel: CONFIG.defaultModel,
  messages: [],
  isTyping: false,
  imageRatio: '1:1',
};

// ========== TELEGRAM INIT ==========
const tg = window.Telegram.WebApp;
tg.expand();
tg.ready();

// Set theme colors
document.documentElement.style.setProperty('--tg-theme-bg-color', '#0b0b0b');
document.documentElement.style.setProperty('--tg-theme-text-color', '#ffffff');

// ========== DOM ELEMENTS ==========
const elements = {
  chatContainer: document.getElementById('chatContainer'),
  messages: document.getElementById('messages'),
  messageInput: document.getElementById('messageInput'),
  currentModelIcon: document.getElementById('currentModelIcon'),
  currentModelName: document.getElementById('currentModelName'),
  currentModelType: document.getElementById('currentModelType'),
  modelList: document.getElementById('modelList'),
  modelDrawer: document.getElementById('modelDrawer'),
  settingsModal: document.getElementById('settingsModal'),
  imagePanel: document.getElementById('imagePanel'),
  generateBtn: document.getElementById('generateBtn'),
  shimmer: document.getElementById('shimmer'),
  welcomeMessage: document.getElementById('welcomeMessage'),
};

// ========== INITIALIZE ==========
function init() {
  loadModels();
  loadHistory();
  updateModelDisplay();
  
  // Auto-focus input
  elements.messageInput.focus();
}

// ========== MODEL FUNCTIONS ==========
function loadModels() {
  elements.modelList.innerHTML = '';
  
  // Group models by category
  const textModels = CONFIG.models.filter(m => m.category === 'text' || m.category === 'code');
  const imageModels = CONFIG.models.filter(m => m.category === 'image');
  
  // Add text models
  if (textModels.length > 0) {
    const header = document.createElement('div');
    header.className = 'model-item';
    header.style.background = 'transparent';
    header.style.border = 'none';
    header.innerHTML = '<span style="color: var(--text-muted); font-size: 12px; text-transform: uppercase; letter-spacing: 1px;">Chat Models</span>';
    elements.modelList.appendChild(header);
    
    textModels.forEach(model => {
      elements.modelList.appendChild(createModelItem(model));
    });
  }
  
  // Add image models
  if (imageModels.length > 0) {
    const header = document.createElement('div');
    header.className = 'model-item';
    header.style.background = 'transparent';
    header.style.border = 'none';
    header.innerHTML = '<span style="color: var(--text-muted); font-size: 12px; text-transform: uppercase; letter-spacing: 1px;">Image Models</span>';
    elements.modelList.appendChild(header);
    
    imageModels.forEach(model => {
      elements.modelList.appendChild(createModelItem(model));
    });
  }
}

function createModelItem(model) {
  const item = document.createElement('div');
  item.className = `model-item ${model.id === state.currentModel ? 'active' : ''}`;
  item.onclick = () => selectModel(model.id);
  
  item.innerHTML = `
    <div class="model-item-icon">${model.icon}</div>
    <div class="model-item-info">
      <div class="model-item-name">${model.name}</div>
      <div class="model-item-desc">${model.type}</div>
    </div>
    <div class="model-item-check">✓</div>
  `;
  
  return item;
}

function selectModel(modelId) {
  state.currentModel = modelId;
  updateModelDisplay();
  closeModelDrawer();
  
  // Show/hide image panel based on model type
  const model = CONFIG.models.find(m => m.id === modelId);
  if (model && model.category === 'image') {
    elements.imagePanel.style.display = 'block';
  } else {
    elements.imagePanel.style.display = 'none';
  }
  
  // Save to local storage
  localStorage.setItem('selectedModel', modelId);
}

function updateModelDisplay() {
  const model = CONFIG.models.find(m => m.id === state.currentModel);
  if (model) {
    elements.currentModelIcon.textContent = model.icon;
    elements.currentModelName.textContent = model.name;
    elements.currentModelType.textContent = model.type;
  }
}

function toggleModelDrawer() {
  elements.modelDrawer.classList.toggle('active');
}

function closeModelDrawer(event) {
  if (!event || event.target === elements.modelDrawer) {
    elements.modelDrawer.classList.remove('active');
  }
}

// ========== MESSAGE FUNCTIONS ==========
async function sendMessage() {
  const text = elements.messageInput.value.trim();
  if (!text || state.isTyping) return;
  
  // Clear input
  elements.messageInput.value = '';
  elements.messageInput.style.height = 'auto';
  
  // Hide welcome message
  if (elements.welcomeMessage) {
    elements.welcomeMessage.style.display = 'none';
  }
  
  // Add user message
  addMessage('user', text);
  
  // Show typing indicator
  state.isTyping = true;
  const typingEl = addTypingIndicator();
  
  try {
    // Call API
    const response = await callAPI(text);
    
    // Remove typing indicator
    removeTypingIndicator(typingEl);
    
    // Add assistant message
    addMessage('assistant', response);
  } catch (error) {
    // Remove typing indicator
    removeTypingIndicator(typingEl);
    
    // Add error message
    addMessage('assistant', '❌ Error: ' + error.message);
  } finally {
    state.isTyping = false;
  }
}

async function callAPI(text) {
  // Mock API call - replace with actual backend integration
  const response = await fetch(CONFIG.API_URL + '/webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: {
        chat: { id: tg.initDataUnsafe?.user?.id || 1 },
        text: text,
        from: { first_name: tg.initDataUnsafe?.user?.first_name || 'User' }
      }
    })
  });
  
  // For demo purposes, simulate a response
  // In production, this would return actual AI response
  await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000));
  
  // Mock responses based on input
  if (text.toLowerCase().includes('hello') || text.toLowerCase().includes('hi')) {
    return "Hello! 👋 How can I help you today?";
  } else if (text.toLowerCase().includes('model')) {
    return "I'm currently using **" + getCurrentModelName() + "**. You can change me in the model selector!";
  } else if (text.toLowerCase().includes('image') || text.toLowerCase().includes('picture')) {
    return "I can generate images! Switch to an image model and use the generate button.";
  } else {
    return "I received your message: **" + text + "**\n\nI'm using **" + getCurrentModelName() + "** to process this. In a production environment, this would be processed by the AI model.";
  }
}

function getCurrentModelName() {
  const model = CONFIG.models.find(m => m.id === state.currentModel);
  return model ? model.name : 'Unknown';
}

function addMessage(role, content) {
  const messageDiv = document.createElement('div');
  messageDiv.className = `message ${role}`;
  
  if (role === 'assistant') {
    messageDiv.innerHTML = '<span class="ai-icon">✨</span> ' + formatMessage(content);
  } else {
    messageDiv.textContent = content;
  }
  
  elements.messages.appendChild(messageDiv);
  
  // Save to history
  state.messages.push({ role, content, timestamp: Date.now() });
  saveHistory();
  
  // Scroll to bottom
  scrollToBottom();
}

function addTypingIndicator() {
  const typingDiv = document.createElement('div');
  typingDiv.className = 'typing-indicator';
  typingDiv.innerHTML = `
    <div class="typing-dot"></div>
    <div class="typing-dot"></div>
    <div class="typing-dot"></div>
  `;
  elements.messages.appendChild(typingDiv);
  scrollToBottom();
  return typingDiv;
}

function removeTypingIndicator(element) {
  if (element && element.parentNode) {
    element.parentNode.removeChild(element);
  }
}

function formatMessage(text) {
  // Simple markdown formatting
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br>');
}

function scrollToBottom() {
  setTimeout(() => {
    elements.chatContainer.scrollTop = elements.chatContainer.scrollHeight;
  }, 50);
}

// ========== IMAGE GENERATION ==========
function selectAspect(button) {
  // Remove active from all buttons
  document.querySelectorAll('.aspect-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  
  // Add active to clicked button
  button.classList.add('active');
  state.imageRatio = button.dataset.ratio;
}

async function generateImage() {
  const prompt = elements.messageInput.value.trim();
  if (!prompt) {
    alert('Please enter a description for the image');
    return;
  }
  
  // Show loading
  elements.generateBtn.disabled = true;
  elements.generateBtn.querySelector('.btn-text').textContent = 'Generating...';
  elements.shimmer.style.display = 'block';
  
  try {
    // Parse ratio
    const [width, height] = state.imageRatio.split(':').map(Number);
    const size = 1024;
    const imgWidth = width >= height ? size : Math.round(size * (width / height));
    const imgHeight = height >= width ? size : Math.round(size * (height / width));
    
    // Generate image URL
    const imageUrl = CONFIG.imageEndpoint + 
      encodeURIComponent(prompt) + 
      '?width=' + imgWidth + 
      '&height=' + imgHeight + 
      '&nologo=true&model=' + state.currentModel + 
      '&seed=' + Math.floor(Math.random() * 999999);
    
    // Add image message
    addImageMessage(imageUrl, prompt);
    
    // Clear input
    elements.messageInput.value = '';
  } catch (error) {
    addMessage('assistant', '❌ Error generating image: ' + error.message);
  } finally {
    // Reset button
    elements.generateBtn.disabled = false;
    elements.generateBtn.querySelector('.btn-text').textContent = '✨ Generate';
    elements.shimmer.style.display = 'none';
  }
}

function addImageMessage(imageUrl, caption) {
  const messageDiv = document.createElement('div');
  messageDiv.className = 'message image assistant';
  
  messageDiv.innerHTML = `
    <img src="${imageUrl}" alt="${caption}" loading="lazy" onclick="viewImage('${imageUrl}')">
    <div style="padding: 8px 4px 4px; font-size: 12px; color: var(--text-secondary);">${caption}</div>
  `;
  
  elements.messages.appendChild(messageDiv);
  
  // Save to history
  state.messages.push({ role: 'assistant', content: imageUrl, type: 'image', caption, timestamp: Date.now() });
  saveHistory();
  
  scrollToBottom();
}

function viewImage(imageUrl) {
  // Open image in Telegram
  tg.openLink(imageUrl);
}

// ========== IMAGE PANEL ==========
function toggleImagePanel() {
  const isImageModel = CONFIG.models.find(m => m.id === state.currentModel)?.category === 'image';
  
  if (isImageModel) {
    elements.imagePanel.style.display = 
      elements.imagePanel.style.display === 'none' ? 'block' : 'none';
  } else {
    // Switch to first image model
    const imageModel = CONFIG.models.find(m => m.category === 'image');
    if (imageModel) {
      selectModel(imageModel.id);
      elements.imagePanel.style.display = 'block';
    }
  }
}

function closeImagePanel() {
  elements.imagePanel.style.display = 'none';
}

// ========== SETTINGS ==========
function openSettings() {
  elements.settingsModal.classList.add('active');
}

function closeSettings(event) {
  if (!event || event.target === elements.settingsModal) {
    elements.settingsModal.classList.remove('active');
  }
}

function clearHistory() {
  if (confirm('Are you sure you want to clear all chat history?')) {
    state.messages = [];
    elements.messages.innerHTML = '';
    localStorage.removeItem('chatHistory');
    
    // Show welcome message again
    if (elements.welcomeMessage) {
      elements.welcomeMessage.style.display = 'flex';
    }
    
    closeSettings();
  }
}

// ========== HISTORY ==========
function saveHistory() {
  // Keep only last 50 messages
  const historyToSave = state.messages.slice(-50);
  localStorage.setItem('chatHistory', JSON.stringify(historyToSave));
}

function loadHistory() {
  const saved = localStorage.getItem('chatHistory');
  if (saved) {
    try {
      state.messages = JSON.parse(saved);
      
      // Render messages
      state.messages.forEach(msg => {
        if (msg.type === 'image') {
          addImageMessage(msg.content, msg.caption);
        } else {
          addMessage(msg.role, msg.content);
        }
      });
      
      // Hide welcome if there are messages
      if (state.messages.length > 0 && elements.welcomeMessage) {
        elements.welcomeMessage.style.display = 'none';
      }
    } catch (e) {
      console.error('Failed to load history:', e);
    }
  }
  
  // Load saved model
  const savedModel = localStorage.getItem('selectedModel');
  if (savedModel) {
    state.currentModel = savedModel;
  }
}

// ========== INPUT HANDLING ==========
function handleKeyDown(event) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    sendMessage();
  }
}

function autoResize(textarea) {
  textarea.style.height = 'auto';
  textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
}

// ========== INITIALIZE APP ==========
document.addEventListener('DOMContentLoaded', init);
