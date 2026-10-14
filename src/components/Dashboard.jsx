import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import SemesterCalculator from './SemesterCalculator';
import OverallCalculator from './OverallCalculator';
import TargetCalculator from './TargetCalculator';
import { Save, LayoutDashboard, History, Target } from 'lucide-react';
import './Dashboard.css';

export default function Dashboard() {
  const { currentUser, logout, userData, saveUserData, isLoading } = useAuth();
  const [activeTab, setActiveTab] = useState('semester'); // 'semester', 'overall', or 'target'
  
  // Local state to hold the current values of calculators before saving
  const [semesterData, setSemesterData] = useState(null);
  const [overallData, setOverallData] = useState(null);
  const [targetData, setTargetData] = useState(null);
  const [saveStatus, setSaveStatus] = useState('');

  // Load user data on mount
  useEffect(() => {
    if (userData) {
      if (userData.semester) setSemesterData(userData.semester);
      if (userData.overall) setOverallData(userData.overall);
      if (userData.target) setTargetData(userData.target);
    }
  }, [userData]);

  if (isLoading) {
    return (
      <div className="dashboard-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
        <h2 className="smooth-gradient-text animate-pulse">Syncing Cloud Database...</h2>
      </div>
    );
  }

  const handleSave = async () => {
    const dataToSave = {
      semester: semesterData,
      overall: overallData,
      target: targetData
    };
    
    setSaveStatus('Saving...');
    try {
      await saveUserData(dataToSave);
      setSaveStatus('✓ Saved!');
    } catch (err) {
      setSaveStatus('Save failed!');
    }
    setTimeout(() => setSaveStatus(''), 2000);
  };

  const handleAddToCGPA = (credits, gpa, name) => {
    if (!credits || credits <= 0) return;
    
    const currentSems = overallData?.semesters || (userData?.overall?.semesters || []);
    const newSem = {
      id: crypto.randomUUID(),
      name: name || `Added Sem ${currentSems.length + 1}`,
      credits: credits,
      gpa: gpa,
      isIncluded: true
    };
    
    setOverallData({
      ...overallData,
      semesters: [...currentSems, newSem]
    });
    
    // Switch to the overall tab to show the newly added semester!
    setActiveTab('overall');
  };

  const handleBatchAddToCGPA = (semsToAdd) => {
    if (!Array.isArray(semsToAdd) || semsToAdd.length === 0) return;

    const currentSems = overallData?.semesters || (userData?.overall?.semesters || []);
    const validSems = semsToAdd
      .filter(s => s && s.credits > 0 && Number(s.gpa) >= 0)
      .map((s, idx) => ({
        id: crypto.randomUUID(),
        name: s.name || `Added Sem ${currentSems.length + idx + 1}`,
        credits: Number(s.credits),
        gpa: Number(s.gpa),
        isIncluded: true
      }));

    if (validSems.length === 0) return;

    setOverallData({
      ...overallData,
      semesters: [...currentSems, ...validSems]
    });

    setActiveTab('overall');
  };

  return (
    <div className="dashboard-container">
      <div className="dashboard-subnav">
        <div className="nav-tabs">
          <button 
            className={`nav-tab ${activeTab === 'semester' ? 'active' : ''}`}
            onClick={() => setActiveTab('semester')}
          >
            <LayoutDashboard size={18} />
            Semester GPA
          </button>
          <button 
            className={`nav-tab ${activeTab === 'overall' ? 'active' : ''}`}
            onClick={() => setActiveTab('overall')}
          >
            <History size={18} />
            CGPA
          </button>
          <button 
            className={`nav-tab ${activeTab === 'target' ? 'active' : ''}`}
            onClick={() => setActiveTab('target')}
          >
            <Target size={18} />
            Target CGPA
          </button>
        </div>

        <div className="nav-actions">
          <button className="btn-primary btn-save" onClick={handleSave}>
            <Save size={16} />
            {saveStatus || 'Save Data to Cloud'}
          </button>
        </div>
      </div>

      <main className="dashboard-content">
        <div className="tab-content animate-fade-in">
          {activeTab === 'semester' && (
            <SemesterCalculator 
              key={userData ? 'loaded' : 'default'}
              initialData={semesterData || userData?.semester} 
              overallData={overallData || userData?.overall}
              onChange={setSemesterData} 
              onAddToCGPA={handleAddToCGPA}
              onBatchAddToCGPA={handleBatchAddToCGPA}
            />
          )}
          {activeTab === 'overall' && (
            <OverallCalculator 
              key={userData ? 'loaded' : 'default'}
              initialData={overallData || userData?.overall} 
              onChange={setOverallData} 
            />
          )}
          {activeTab === 'target' && (
            <TargetCalculator 
              key={userData ? 'loaded' : 'default'}
              initialData={targetData || userData?.target} 
              onChange={setTargetData} 
            />
          )}
        </div>
      </main>
    </div>
  );
}
