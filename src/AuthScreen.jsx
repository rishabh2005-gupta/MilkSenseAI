import { useState } from 'react'
import { apiRequest } from './api.js'
import './AuthScreen.css'

export default function AuthScreen({ onAuthenticated, initialMessage = '', initialError = '', verifyMessage = '', loading = false }) {
  const [mode, setMode] = useState('login')
  const [form, setForm] = useState({ name: '', email: '', farmName: '', password: '' })
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [resendMessage, setResendMessage] = useState('')

  async function submit(event) {
    event.preventDefault()
    setError('')
    setMessage('')
    setBusy(true)
    try {
      if (mode === 'signup') {
        const result = await apiRequest('/auth/register', { method: 'POST', body: JSON.stringify(form) })
        setMessage(result.message)
      } else {
        const result = await apiRequest('/auth/login', {
          method: 'POST',
          body: JSON.stringify({ email: form.email, password: form.password }),
        })
        onAuthenticated(result.user)
      }
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setBusy(false)
    }
  }

  async function resendVerification() {
    setError('')
    setResendMessage('')
    try {
      const result = await apiRequest('/auth/resend-verification', {
        method: 'POST',
        body: JSON.stringify({ email: form.email }),
      })
      setResendMessage(result.message)
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="auth-brand"><span className="auth-brand-mark">M</span><strong>MilkSense<span>AI</span></strong></div>
        <p className="auth-eyebrow">DAIRY INTELLIGENCE</p>
        {loading ? <div className="auth-loading" role="status">Checking your session…</div> : (
          <>
            <h1>{mode === 'signup' ? 'Create your account' : 'Welcome back'}</h1>
            <p className="auth-description">{mode === 'signup' ? 'Register your farm workspace to manage herd data and predictions.' : 'Sign in to your verified farm workspace.'}</p>
            {(initialMessage || verifyMessage) && <div className="auth-message" role="status">{verifyMessage || initialMessage}</div>}
            {initialError && <div className="auth-error" role="alert">{initialError}</div>}
            {message && <div className="auth-message" role="status">{message}</div>}
            {error && <div className="auth-error" role="alert">{error}</div>}
            {resendMessage && <div className="auth-message" role="status">{resendMessage}</div>}
            <form className="auth-form" onSubmit={submit}>
              {mode === 'signup' && <>
                <label>Full name<input required autoComplete="name" maxLength="120" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
                <label>Farm or organization<input required autoComplete="organization" maxLength="160" value={form.farmName} onChange={(event) => setForm({ ...form, farmName: event.target.value })} /></label>
              </>}
              <label>Email address<input required type="email" autoComplete="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label>
              <label>Password<input required type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} minLength={mode === 'signup' ? 12 : undefined} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} /></label>
              {mode === 'signup' && <small className="auth-hint">Use at least 12 characters. Email verification is required before sign in.</small>}
              <button className="auth-submit" disabled={busy}>{busy ? 'Please wait…' : mode === 'signup' ? 'Create account' : 'Sign in'}</button>
            </form>
            {mode === 'login' && error.toLowerCase().includes('verify your email') && <button className="auth-mode-toggle" onClick={resendVerification}>Resend verification email</button>}
            <button className="auth-mode-toggle" onClick={() => { setMode(mode === 'signup' ? 'login' : 'signup'); setError(''); setMessage('') }}>
              {mode === 'signup' ? 'Already registered? Sign in' : 'New to MilkSense AI? Create an account'}
            </button>
          </>
        )}
      </section>
    </main>
  )
}
