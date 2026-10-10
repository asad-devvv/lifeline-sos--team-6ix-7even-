import React from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.jsx';

class Boundary extends React.Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    return this.state.error
      ? <pre style={{ padding: 16, color: '#b91c1c', whiteSpace: 'pre-wrap' }}>Something broke: {String(this.state.error.stack || this.state.error)}</pre>
      : this.props.children;
  }
}
createRoot(document.getElementById('root')).render(<Boundary><App /></Boundary>);
