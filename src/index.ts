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
const AUTH_URL = "https://mauthn.mukham.in/oauth/authorize"
const TOKEN_URL = "https://mauthn.mukham.in/oauth/token"
const API_BASE_URL = "https://mauthn.mukham.in"
const CLIENT_ID = "your_client_id"
const CLIENT_SECRET = "your_client_secret"

// Home route
app.get('/', (c) => {
  return c.html(html`
    <!DOCTYPE html>
    <html>
      <head>
        <title>OAuth 2.0 Test Application: MAuthN Test</title>
      </head>
      <body>
        <h1>OAuth 2.0 Test Application: MAuthN Test</h1>
        <a href="/login">Login with OAuth Provider</a>
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
  
  // Display the user profile
  return c.html(html`
    <!DOCTYPE html>
    <html>
      <head>
        <title>User Profile</title>
      </head>
      <body>
        <h1>User Profile</h1>
        <pre>${JSON.stringify(userInfo, null, 2)}</pre>
        <a href="/profilepic">Profile pic</a>
        <a href="/refresh">Refresh Token</a>
        <a href="/logout">Logout</a>
      </body>
    </html>
  `)
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
      </head>
      <body>
        <h1>User Profile</h1>
        <img src="data:image/png;base64, ${userInfo.image}" />
        <br>
        <a href="/profile">Profile details</a>
        <a href="/refresh">Refresh Token</a>
        <a href="/logout">Logout</a>
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
