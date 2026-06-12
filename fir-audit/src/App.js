import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { GlobalsProvider } from './context/GlobalsContext';
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import FIRLayout from './layout/FIRLayout';
import FIROverview from './pages/FIROverview';
import FIRAudits from './pages/FIRAudits';
import FIRAnalytics from './pages/FIRAnalytics';
import FIRSettings from './pages/FIRSettings';
import FIRBlockers from './pages/FIRBlockers';
import FileFIR from './pages/FileFIR';
import FIRDocument from './pages/FIRDocument';

function App() {
  return (
    <GlobalsProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/dashboard" element={<FIRLayout />}>
            <Route index element={<FIROverview />} />
            <Route path="audits" element={<FIRAudits />} />
            <Route path="file-fir" element={<FileFIR />} />
            <Route path="analytics" element={<FIRAnalytics />} />
            <Route path="blockers" element={<FIRBlockers />} />
            <Route path="settings" element={<FIRSettings />} />
            <Route path="fir-document/:id" element={<FIRDocument />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </GlobalsProvider>
  );
}

export default App;
