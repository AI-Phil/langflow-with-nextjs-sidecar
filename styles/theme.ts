// styles/theme.ts
import { createTheme } from '@mui/material/styles';

// Define colors for light and dark mode directly in the theme
const lightTheme = createTheme({
  palette: {
    mode: 'light',
    background: {
      default: '#ffffff',
      paper: '#ffffff',
    },
    text: {
      primary: '#000000',
    },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundColor: 'var(--background)',
          color: 'var(--foreground)',
        },
      },
    },
  },
});

const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    background: {
      default: '#1f2937', // gray-800
      paper: '#1f2937',
    },
    text: {
      primary: '#e5e7eb', // gray-200
    },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundColor: 'var(--background)',
          color: 'var(--foreground)',
        },
      },
    },
  },
});

export { lightTheme, darkTheme };
