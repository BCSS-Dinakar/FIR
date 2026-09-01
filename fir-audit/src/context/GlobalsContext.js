import React, { createContext, useContext, useState, useEffect } from 'react';
import { checkMe, updateGlobals } from '../api/auth';

const GlobalsContext = createContext();

export const GlobalsProvider = ({ children }) => {
  const [collapsed, setCollapsed] = useState(() => {
    const saved = localStorage.getItem('sidebar-collapsed');
    return saved !== null ? JSON.parse(saved) : false;
  });

  const [dark, setDark] = useState(() => {
    const saved = localStorage.getItem('theme');
    return saved !== null ? JSON.parse(saved) : true;
  });

  const [officer, setOfficer] = useState(null);
  const [loadingUser, setLoadingUser] = useState(true);

  // Sync collapsed state with localStorage
  useEffect(() => {
    localStorage.setItem('sidebar-collapsed', JSON.stringify(collapsed));
  }, [collapsed]);

  // Sync theme with localStorage
  useEffect(() => {
    localStorage.setItem('theme', JSON.stringify(dark));
  }, [dark]);

  // Load user info and sync UI settings from DB
  const loadUser = async () => {
    try {
      const data = await checkMe();
      if (data && data.success && data.user) {
        setOfficer(data.user);

        // Sync states with backend values if they exist
        if (data.user.themeModeUi) {
          setDark(data.user.themeModeUi === 'dark');
        }
        if (data.user.sidebarCollapse !== undefined) {
          setCollapsed(data.user.sidebarCollapse);
        }
        return data.user;
      } else {
        setOfficer(null);
        return null;
      }
    } catch (err) {
      setOfficer(null);
      return null;
    } finally {
      setLoadingUser(false);
    }
  };

  useEffect(() => {
    loadUser();
  }, []);

  // Wrap state setters to update the database asynchronously
  const toggleDark = (valOrFn) => {
    setDark((prevDark) => {
      const nextDark = typeof valOrFn === 'function' ? valOrFn(prevDark) : valOrFn;

      if (officer) {
        updateGlobals({ themeModeUi: nextDark ? 'dark' : 'light' }).catch((err) => {
          console.error('Failed to persist theme mode to DB:', err);
        });
      }
      return nextDark;
    });
  };

  const toggleCollapsed = (valOrFn) => {
    setCollapsed((prevCollapsed) => {
      const nextCollapsed = typeof valOrFn === 'function' ? valOrFn(prevCollapsed) : valOrFn;

      if (officer) {
        updateGlobals({ sidebarCollapse: nextCollapsed }).catch((err) => {
          console.error('Failed to persist sidebar collapse to DB:', err);
        });
      }
      return nextCollapsed;
    });
  };

  return (
    <GlobalsContext.Provider
      value={{
        collapsed,
        setCollapsed: toggleCollapsed,
        dark,
        setDark: toggleDark,
        officer,
        setOfficer,
        loadingUser,
        refetchUser: loadUser
      }}
    >
      {children}
    </GlobalsContext.Provider>
  );
};

export const useGlobals = () => {
  const context = useContext(GlobalsContext);
  if (!context) {
    throw new Error('useGlobals must be used within a GlobalsProvider');
  }
  return context;
};
