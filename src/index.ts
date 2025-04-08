import { Hono } from 'hono'
import { setCookie, getCookie } from 'hono/cookie'
import { html } from 'hono/html'

const app = new Hono()

// Define session middleware
const session = async (c: any, next: any) => {
  // Create a session store if one doesn't exist
  c.session = {}
  
  // Get the session from the cookie
  const sessionCookie = getCookie(c, 'session')
  if (sessionCookie) {
    try {
      c.session = JSON.parse(atob(sessionCookie))
    } catch (e) {
      // Invalid session cookie, just use an empty session
    }
  }
  
  // Save the session method
  c.saveSession = () => {
    const sessionData = btoa(JSON.stringify(c.session))
    setCookie(c, 'session', sessionData, {
      httpOnly: true,
      path: '/',
      maxAge: 60 * 60 * 24, // 1 day
      sameSite: 'Lax'
    })
  }
  
  await next()
}

// Apply session middleware to all routes - MOVED THIS UP before any routes
app.use('*', session)

// OAuth configuration
const REDIRECT_URI = "https://demo-mauthn.nullvijayawada.org/callback"
// const REDIRECT_URI = "http://localhost:8787/callback"  // uncomment this for local testing

const AUTH_URL = "https://mauthn.mukham.in/oauth/authorize"
const TOKEN_URL = "https://mauthn.mukham.in/oauth/token"
const API_BASE_URL = "https://mauthn.mukham.in"
const CLIENT_ID = "mukham-test-app"
const CLIENT_SECRET = "your_client_secret"

// Home route
app.get('/', (c) => {
  return c.html(html`
    <!DOCTYPE html>
    <html>
      <head>
        <title>OAuth 2.0 Test Application: MAuthN Test</title>
        <style>
          body {
            background-color: #121212;
            color: #e0e0e0;
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.6;
            margin: 0;
            padding: 20px;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
          }
          h1 {
            color: #bb86fc;
            margin-bottom: 30px;
            text-align: center;
          }
          a {
            display: inline-block;
            background-color: #3700b3;
            color: white;
            padding: 12px 24px;
            text-decoration: none;
            border-radius: 4px;
            font-weight: 500;
            transition: background-color 0.3s;
          }
          a:hover {
            background-color: #6200ee;
          }
          .container {
            max-width: 600px;
            text-align: center;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>OAuth 2.0 Test Application: MAuthN Test</h1>
          <a href="/login">Login with OAuth Provider</a>
        </div>
      </body>
    </html>
  `)
})

// Generate a random string for state parameter
const generateState = () => {
  const array = new Uint8Array(16)
  crypto.getRandomValues(array)
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('')
}

// Login route
app.get('/login', (c) => {
  // Generate a state parameter to prevent CSRF
  const state = generateState()
  c.session.oauthState = state
  c.saveSession()
  
  // Construct the authorization URL
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: 'email',
    state: state
  })
  
  const authUrl = `${AUTH_URL}?${params.toString()}`
  return c.redirect(authUrl)
})

// Callback route
app.get('/callback', async (c) => {
  // Verify state parameter to prevent CSRF
  const state = c.req.query('state')
  if (state !== c.session.oauthState) {
    return c.json({ error: 'Invalid state parameter' }, 400)
  }
  
  // Exchange authorization code for access token
  const code = c.req.query('code')
  if (!code) {
    return c.json({ error: 'No authorization code received' }, 400)
  }
  
  const tokenData = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    code: code,
    redirect_uri: REDIRECT_URI,
    grant_type: 'authorization_code'
  })
  
  // Make the token request
  const tokenResponse = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: tokenData.toString()
  })
  
  if (!tokenResponse.ok) {
    return c.json({
      error: 'Failed to obtain access token',
      details: await tokenResponse.text()
    }, 400)
  }
  
  // Parse the token response
  const tokenInfo = await tokenResponse.json()
  c.session.accessToken = tokenInfo.access_token
  c.session.refreshToken = tokenInfo.refresh_token
  c.saveSession()
  
  return c.redirect('/profile')
})

// Profile route
app.get('/profile', async (c) => {
  // Get the access token from session
  const accessToken = c.session.accessToken
  if (!accessToken) {
    return c.redirect('/login')
  }
  
  // Make an API request using the access token
  const response = await fetch(`${API_BASE_URL}/userinfo`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`
    }
  })
  
  if (!response.ok) {
    return c.json({
      error: 'Failed to fetch user profile',
      details: await response.text()
    }, 400)
  }
  
  const userInfo = await response.json()
  
  // Display the user profile with token inspector
  return c.html(html`
    <!DOCTYPE html>
    <html>
      <head>
        <title>User Profile</title>
        <style>
          body {
            background-color: #121212;
            color: #e0e0e0;
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.6;
            margin: 0;
            padding: 20px;
            display: flex;
            flex-direction: column;
            align-items: center;
          }
          h1, h2, h3 {
            color: #bb86fc;
          }
          pre {
            background-color: #1e1e1e;
            padding: 20px;
            border-radius: 4px;
            overflow-x: auto;
            width: 100%;
            max-width: 600px;
            margin-bottom: 20px;
          }
          .btn-container {
            display: flex;
            gap: 10px;
            margin-top: 20px;
            flex-wrap: wrap;
            justify-content: center;
          }
          a {
            background-color: #3700b3;
            color: white;
            padding: 10px 20px;
            text-decoration: none;
            border-radius: 4px;
            font-weight: 500;
            transition: background-color 0.3s;
          }
          a:hover {
            background-color: #6200ee;
          }
          .container {
            max-width: 800px;
            width: 100%;
          }
          .jwt-section {
            background-color: #1e1e1e;
            border-radius: 8px;
            padding: 20px;
            margin-top: 20px;
            border: 1px solid #333;
          }
          .jwt-part {
            margin-bottom: 15px;
            padding: 10px;
            background-color: #252525;
            border-radius: 4px;
          }
          .jwt-header {
            border-left: 4px solid #03DAC6;
          }
          .jwt-payload {
            border-left: 4px solid #bb86fc;
          }
          .jwt-signature {
            border-left: 4px solid #CF6679;
          }
          .jwt-info {
            display: flex;
            justify-content: space-between;
            margin-bottom: 10px;
            padding: 8px;
            background-color: #252525;
            border-radius: 4px;
          }
          .jwt-expiry {
            color: ${accessToken.split('.').length === 3 ? '#03DAC6' : '#CF6679'};
            font-weight: bold;
          }
          .tab {
            cursor: pointer;
            padding: 10px 20px;
            background-color: #252525;
            border-radius: 4px 4px 0 0;
            margin-right: 5px;
          }
          .tab.active {
            background-color: #3700b3;
            color: white;
          }
          .tab-content {
            display: none;
          }
          .tab-content.active {
            display: block;
          }
          .token-info-box {
            background-color: #1e1e1e;
            border-radius: 8px;
            padding: 20px;
            margin: 20px 0;
            border-left: 4px solid #03DAC6;
          }
          .info-badge {
            background-color: #3700b3;
            color: white;
            padding: 4px 10px;
            border-radius: 12px;
            font-size: 0.8rem;
            display: inline-block;
            margin-bottom: 10px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>User Profile</h1>
          
          <div class="tabs">
            <span class="tab active" onclick="openTab(event, 'profile-tab')">Profile</span>
            <span class="tab" onclick="openTab(event, 'token-tab')">Access Token</span>
          </div>
          
          <div id="profile-tab" class="tab-content active">
            <pre>${JSON.stringify(userInfo, null, 2)}</pre>
          </div>
          
          <div id="token-tab" class="tab-content">
            <h2>Access Token Inspector</h2>
            <div class="jwt-section">
              <h3>Your Access Token</h3>
              <pre>${accessToken}</pre>
              
              <div id="token-decoded">Loading...</div>
            </div>
          </div>
          
          <div class="btn-container">
            <a href="/profilepic">Profile pic</a>
            <a href="/refresh">Refresh Token</a>
            <a href="/logout">Logout</a>
          </div>
        </div>
        
        <script>
          function openTab(evt, tabName) {
            const tabContents = document.getElementsByClassName("tab-content");
            for (let i = 0; i < tabContents.length; i++) {
              tabContents[i].classList.remove("active");
            }
            
            const tabs = document.getElementsByClassName("tab");
            for (let i = 0; i < tabs.length; i++) {
              tabs[i].classList.remove("active");
            }
            
            document.getElementById(tabName).classList.add("active");
            evt.currentTarget.classList.add("active");
          }
          
          // Simple function to detect and decode JWT token parts
          function parseToken(token) {
            // Check if token appears to be JWT (has two dots and three parts)
            const parts = token.split('.');
            if (parts.length !== 3) {
              return { 
                valid: false, 
                isJwt: false,
                message: "This is an opaque token, not a JWT token. Opaque tokens cannot be decoded client-side." 
              };
            }
            
            // Try to decode it as JWT
            try {
              // Base64Url decode
              function urlDecode(str) {
                // Add padding if needed
                str = str.replace(/-/g, '+').replace(/_/g, '/');
                while (str.length % 4) {
                  str += '=';
                }
                try {
                  return JSON.parse(decodeURIComponent(atob(str).split('').map(c =>
                    '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)
                  ).join('')));
                } catch (e) {
                  return { error: "Could not decode this part" };
                }
              }
              
              const header = urlDecode(parts[0]);
              const payload = urlDecode(parts[1]);
              
              // Additional check: header should have alg and typ
              if (!header.alg) {
                return { 
                  valid: false, 
                  isJwt: false,
                  message: "This appears to be formatted like a JWT but doesn't contain valid JWT header data." 
                };
              }
              
              return {
                valid: true,
                isJwt: true,
                header,
                payload,
                signature: parts[2]
              };
            } catch (e) {
              return { 
                valid: false, 
                isJwt: false,
                message: "Error parsing JWT: " + e.message 
              };
            }
          }
          
          // Display token information
          function displayTokenInfo() {
            const token = "${accessToken}";
            const tokenInfo = parseToken(token);
            
            let html = '';
            
            if (!tokenInfo.isJwt) {
              html = '<div class="token-info-box">' +
                '<span class="info-badge">Opaque Token</span>' +
                '<h3>Token Information</h3>' +
                '<p>' + tokenInfo.message + '</p>' +
                '<p>This token is still valid for authentication with the API, but its contents cannot be inspected client-side.</p>' +
                '<p>Opaque tokens provide better security as they are reference tokens stored server-side.</p>' +
                '</div>';
            } else if (!tokenInfo.valid) {
              html = '<div class="jwt-part"><h3>Invalid JWT Format</h3><p>' + tokenInfo.message + '</p></div>';
            } else {
              // Header
              html += '<div class="jwt-part jwt-header"><h3>Header</h3><pre>' + 
                JSON.stringify(tokenInfo.header, null, 2) + '</pre></div>';
              
              // Payload
              html += '<div class="jwt-part jwt-payload"><h3>Payload</h3><pre>' + 
                JSON.stringify(tokenInfo.payload, null, 2) + '</pre></div>';
              
              // Signature (truncated)
              html += '<div class="jwt-part jwt-signature"><h3>Signature</h3><p>' + 
                tokenInfo.signature.substring(0, 15) + '...' + '</p></div>';
              
              // Expiration info
              if (tokenInfo.payload.exp) {
                const exp = new Date(tokenInfo.payload.exp * 1000);
                const now = new Date();
                const isExpired = now > exp;
                
                html += '<div class="jwt-info"><span>Expiration:</span><span class="jwt-expiry" style="color: ' + 
                  (isExpired ? '#CF6679' : '#03DAC6') + '">' +
                  exp.toLocaleString() + (isExpired ? ' (EXPIRED)' : '') + '</span></div>';
                  
                if (!isExpired) {
                  const diff = exp - now;
                  const minutes = Math.floor(diff / 60000);
                  html += '<div class="jwt-info"><span>Expires in:</span><span>' + 
                    minutes + ' minutes</span></div>';
                }
              }
              
              // Issued at
              if (tokenInfo.payload.iat) {
                const iat = new Date(tokenInfo.payload.iat * 1000);
                html += '<div class="jwt-info"><span>Issued at:</span><span>' + 
                  iat.toLocaleString() + '</span></div>';
              }
            }
            
            document.getElementById('token-decoded').innerHTML = html;
          }
          
          // Execute when page loads
          window.onload = function() {
            displayTokenInfo();
          };
        </script>
      </body>
    </html>
  `);
})

// Profile picture route
app.get('/profilepic', async (c) => {
  // Get the access token from session
  const accessToken = c.session.accessToken
  if (!accessToken) {
    return c.redirect('/login')
  }
  
  // Make an API request using the access token
  const response = await fetch(`${API_BASE_URL}/userimage`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`
    }
  })
  
  if (!response.ok) {
    return c.json({
      error: 'Failed to fetch user profile image',
      details: await response.text()
    }, 400)
  }
  
  const userInfo = await response.json()
  
  // Display the user profile image
  return c.html(html`
    <!DOCTYPE html>
    <html>
      <head>
        <title>User Profile Picture</title>
        <style>
          body {
            background-color: #121212;
            color: #e0e0e0;
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.6;
            margin: 0;
            padding: 20px;
            display: flex;
            flex-direction: column;
            align-items: center;
          }
          h1 {
            color: #bb86fc;
            margin-bottom: 30px;
          }
          img {
            max-width: 300px;
            border-radius: 50%;
            border: 3px solid #3700b3;
            margin-bottom: 20px;
          }
          .btn-container {
            display: flex;
            gap: 10px;
            margin-top: 20px;
          }
          a {
            background-color: #3700b3;
            color: white;
            padding: 10px 20px;
            text-decoration: none;
            border-radius: 4px;
            font-weight: 500;
            transition: background-color 0.3s;
          }
          a:hover {
            background-color: #6200ee;
          }
          .container {
            max-width: 600px;
            display: flex;
            flex-direction: column;
            align-items: center;
            text-align: center;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>User Profile Picture</h1>
          <img src="data:image/png;base64, ${userInfo.image}" alt="Profile Picture" />
          <div class="btn-container">
            <a href="/profile">Profile details</a>
            <a href="/refresh">Refresh Token</a>
            <a href="/logout">Logout</a>
          </div>
        </div>
      </body>
    </html>
  `)
})

// Refresh token route
app.get('/refresh', async (c) => {
  // Get the refresh token from session
  const refreshToken = c.session.refreshToken
  if (!refreshToken) {
    return c.redirect('/login')
  }
  
  // Request a new access token using the refresh token
  const tokenData = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    refresh_token: refreshToken,
    grant_type: 'refresh_token'
  })
  
  const tokenResponse = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: tokenData.toString()
  })
  to
  if (!tokenResponse.ok) {
    // If refresh fails, redirect to login
    return c.redirect('/login')
  }
  
  // Update the session with new tokens
  const tokenInfo = await tokenResponse.json()
  c.session.accessToken = tokenInfo.access_token
  // Some providers also return a new refresh token
  if (tokenInfo.refresh_token) {
    c.session.refreshToken = tokenInfo.refresh_token
  }
  c.saveSession()
  
  return c.redirect('/profile')
})

// Logout route
app.get('/logout', (c) => {
  // Clear the session
  c.session = {}
  c.saveSession()
  return c.redirect('/')
})

export default app
