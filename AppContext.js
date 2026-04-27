import React, { createContext, useContext } from 'react';

const AppSessionContext = createContext(null);
const AppDataContext = createContext(null);
const AppActionsContext = createContext(null);

export function AppProvider({ sessionValue, dataValue, actionsValue, children }) {
  return (
    <AppSessionContext.Provider value={sessionValue}>
      <AppDataContext.Provider value={dataValue}>
        <AppActionsContext.Provider value={actionsValue}>{children}</AppActionsContext.Provider>
      </AppDataContext.Provider>
    </AppSessionContext.Provider>
  );
}

function useRequiredContext(Context, hookName) {
  const context = useContext(Context);

  if (!context) {
    throw new Error(`${hookName} must be used within an AppProvider.`);
  }

  return context;
}

export function useAppSession() {
  return useRequiredContext(AppSessionContext, 'useAppSession');
}

export function useAppData() {
  return useRequiredContext(AppDataContext, 'useAppData');
}

export function useAppActions() {
  return useRequiredContext(AppActionsContext, 'useAppActions');
}

export function useAppContext() {
  return {
    ...useAppSession(),
    ...useAppData(),
    ...useAppActions(),
  };
}
