import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { AppProvider } from './state/AppContext'
import 'maplibre-gl/dist/maplibre-gl.css'
import './styles.css'

createRoot(document.getElementById('root')!).render(<StrictMode><AppProvider><App /></AppProvider></StrictMode>)
