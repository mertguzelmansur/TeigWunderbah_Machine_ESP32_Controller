// Internationalization (i18n) module
const I18N = {
    // Current language code
    currentLanguage: 'en',
    
    // Store for translations
    translations: {},
    
    // Initialize i18n
    init: async function() {
        // Load browser preferred language or default to English
        const storedLang = localStorage.getItem('teigwunderbar_language') || navigator.language.substring(0, 2);
        await this.loadLanguage(storedLang);
        
        // Set up language selector events
        const languageSelector = document.getElementById('languageSelector');
        if (languageSelector) {
            languageSelector.addEventListener('click', async (event) => {
                if (event.target.tagName === 'A') {
                    const langCode = event.target.getAttribute('data-lang');
                    if (langCode) {
                        await this.setLanguage(langCode);
                    }
                }
            });
        }
        
        // Load available languages
        this.loadAvailableLanguages();
    },
    
    // Load available languages from the server
    loadAvailableLanguages: async function() {
        try {
            const response = await fetch('/api/locales');
            const locales = await response.json();
            
            // Update language dropdown
            const languageSelector = document.getElementById('languageSelector');
            if (languageSelector) {
                languageSelector.innerHTML = '';
                
                locales.forEach(locale => {
                    const li = document.createElement('li');
                    const a = document.createElement('a');
                    a.className = 'dropdown-item';
                    a.href = '#';
                    a.setAttribute('data-lang', locale.code);
                    a.textContent = locale.name;
                    li.appendChild(a);
                    languageSelector.appendChild(li);
                });
            }
        } catch (error) {
            console.error('Failed to load available languages:', error);
        }
    },
    
    // Load a language file
    loadLanguage: async function(langCode) {
        try {
            // Default to English if requested language is not available
            let code = langCode;
            
            // Try to load the requested language
            try {
                const response = await fetch(`/static/locales/${code}.json`);
                
                // If language file doesn't exist, fall back to English
                if (!response.ok) {
                    code = 'en';
                    const enResponse = await fetch('/static/locales/en.json');
                    this.translations = await enResponse.json();
                } else {
                    this.translations = await response.json();
                }
            } catch (error) {
                console.error(`Error loading language ${code}:`, error);
                
                // Fall back to English
                code = 'en';
                const enResponse = await fetch('/static/locales/en.json');
                this.translations = await enResponse.json();
            }
            
            this.currentLanguage = code;
            localStorage.setItem('teigwunderbar_language', code);
            
            // Apply translations to the page
            this.updatePageTranslations();
            
            return true;
        } catch (error) {
            console.error('Error loading language:', error);
            return false;
        }
    },
    
    // Set the active language
    setLanguage: async function(langCode) {
        if (langCode === this.currentLanguage) {
            return true; // Already using this language
        }
        
        const success = await this.loadLanguage(langCode);
        return success;
    },
    
    // Get a translation by key (supports nested keys with dot notation)
    get: function(key, defaultValue = '') {
        // Handle nested keys (e.g., "app.settings.title")
        const keyParts = key.split('.');
        let value = this.translations;
        
        for (const part of keyParts) {
            if (value && typeof value === 'object' && part in value) {
                value = value[part];
            } else {
                return defaultValue;
            }
        }
        
        return value || defaultValue;
    },
    
    // Update all elements with data-i18n attributes
    updatePageTranslations: function() {
        const elements = document.querySelectorAll('[data-i18n]');
        
        elements.forEach(element => {
            const key = element.getAttribute('data-i18n');
            const translation = this.get(key, key);
            
            // Check if element is an input with placeholder
            if (element.hasAttribute('placeholder')) {
                element.setAttribute('placeholder', translation);
            } 
            // Check if element is a button or has innerHTML
            else {
                element.textContent = translation;
            }
        });
        
        // Set document language
        document.documentElement.setAttribute('lang', this.currentLanguage);
    }
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    I18N.init();
}); 