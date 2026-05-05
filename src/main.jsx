import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { SpeedInsights } from '@vercel/speed-insights/react'
import './index.css'

import App from './App.jsx'
import WalletContextProvider from './components/WalletContextProvider'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <WalletContextProvider>
      <App />
      <SpeedInsights />
    </WalletContextProvider>
  </StrictMode>,
)
