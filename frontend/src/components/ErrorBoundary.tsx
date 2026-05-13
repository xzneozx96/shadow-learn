import type { ErrorInfo, ReactNode } from 'react'
import { Component } from 'react'
import { ErrorScreen } from '@/components/ErrorScreen'
import { posthog } from '@/lib/posthog'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: unknown
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: unknown): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    posthog.captureException(error, { extra: { componentStack: info.componentStack } })
  }

  render() {
    if (this.state.hasError) {
      return (
        <ErrorScreen error={this.state.error} />
      )
    }
    return this.props.children
  }
}
