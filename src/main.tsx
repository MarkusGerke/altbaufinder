import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ClassificationProvider } from './context/ClassificationContext'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ClassificationProvider>
      <App />
    </ClassificationProvider>
  </StrictMode>,
)
