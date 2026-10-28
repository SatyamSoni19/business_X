import React from 'react';
import Button from './ui/Button';
import { AlertTriangle } from 'lucide-react';

export default class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        console.error('ErrorBoundary caught an error:', error, errorInfo);
    }

    handleReset = () => {
        this.setState({ hasError: false, error: null });
    };

    render() {
        if (this.state.hasError) {
            return (
                <div className="mx-auto max-w-lg rounded-xl border-2 border-slate-900 bg-white p-6 my-8">
                    <div className="flex items-center gap-3 text-red-700">
                        <AlertTriangle size={24} />
                        <h2 className="text-lg font-black text-slate-900">Something went wrong on this page</h2>
                    </div>
                    {this.state.error?.message && (
                        <p className="mt-3 rounded border border-slate-300 bg-slate-100 p-2 text-xs font-mono text-slate-600 break-words">
                            {this.state.error.message}
                        </p>
                    )}
                    <div className="mt-4 flex gap-3">
                        <Button onClick={this.handleReset}>Try again</Button>
                        <Button variant="secondary" onClick={() => window.location.reload()}>Reload</Button>
                    </div>
                </div>
            );
        }
        return this.props.children;
    }
}

