const API_BASE_URL = 'http://127.0.0.1:8000/api/';

document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('auth-form');
    const usernameInput = document.getElementById('username');
    const emailInput = document.getElementById('email');
    const emailField = document.getElementById('email-field');
    const passwordInput = document.getElementById('password');
    const messageEl = document.getElementById('message');
    const titleEl = document.getElementById('form-title');
    const subtitleEl = document.getElementById('form-subtitle');
    const submitBtn = document.getElementById('submit-btn');
    const toggleLink = document.getElementById('toggle-form-link');

    let isLoginMode = true;

    // Function to handle the form submission
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        messageEl.textContent = ''; // Clear previous messages
        
        const username = usernameInput.value;
        const password = passwordInput.value;
        const email = emailInput.value;

        if (isLoginMode) {
            // LOGIN MODE
            try {
                const response = await fetch(`${API_BASE_URL}auth/login/`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password })
                });

                const data = await response.json();
                if (data.token) {
                    await chrome.storage.local.set({ authToken: data.token });
                    messageEl.textContent = 'Login successful! You can now close this tab.';
                    messageEl.className = 'msg-success';
                    setTimeout(() => window.close(), 2000);
                } else {
                    messageEl.textContent = data.non_field_errors[0] || 'Login failed. Invalid credentials.';
                    messageEl.className = 'msg-error';
                }
            } catch (error) {
                messageEl.textContent = 'An error occurred during login. Please try again.';
                messageEl.className = 'msg-error';
                console.error('Login error:', error);
            }
        } else {
            // REGISTRATION MODE
            if (!email) {
                messageEl.textContent = 'Email is required for registration.';
                messageEl.className = 'msg-error';
                return;
            }
            try {
                const response = await fetch(`${API_BASE_URL}auth/register/`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, email, password })
                });

                const data = await response.json();
                if (response.ok) {
                    messageEl.textContent = 'Registration successful! You can now log in.';
                    messageEl.className = 'msg-success';
                    // Automatically switch to login mode after successful registration
                    toggleFormMode();
                } else {
                    messageEl.textContent = data.error || 'Registration failed. Please check your inputs.';
                    messageEl.className = 'msg-error';
                }
            } catch (error) {
                messageEl.textContent = 'An error occurred during registration. Please try again.';
                messageEl.className = 'msg-error';
                console.error('Registration error:', error);
            }
        }
    });

    // Function to toggle between login and registration mode
    toggleLink.addEventListener('click', (e) => {
        e.preventDefault();
        toggleFormMode();
    });

    function toggleFormMode() {
        isLoginMode = !isLoginMode;
        if (isLoginMode) {
            titleEl.textContent = 'Sign in to Comment';
            subtitleEl.textContent = 'Use your credentials to authenticate the plugin.';
            submitBtn.textContent = 'Log In';
            toggleLink.textContent = "Don't have an account? Register here.";
            emailField.classList.add('hidden');
            emailInput.value = '';
        } else {
            titleEl.textContent = 'Register for a New Account';
            subtitleEl.textContent = 'Create an account to start commenting.';
            submitBtn.textContent = 'Register';
            toggleLink.textContent = "Already have an account? Log in here.";
            emailField.classList.remove('hidden');
        }
        messageEl.textContent = '';
        usernameInput.value = '';
        passwordInput.value = '';
    }
});