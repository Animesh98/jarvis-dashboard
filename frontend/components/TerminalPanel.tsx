'use client'

import { useEffect, useRef } from 'react'
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import 'xterm/css/xterm.css'
import styles from './TerminalPanel.module.scss'

interface Props {
  container: string | null
  onClose: () => void
}

export default function TerminalPanel({ container, onClose }: Props) {
  const terminalRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<Terminal | null>(null)
  const wsRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    if (!container || !terminalRef.current) return

    // Initialize xterm.js
    const term = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: '"JetBrains Mono", "Fira Code", monospace',
      theme: {
        background: '#000000',
        foreground: '#ffffff',
      },
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.open(terminalRef.current)
    fitAddon.fit()

    xtermRef.current = term

    // Connect to WebSocket
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = `${protocol}//${window.location.host}/api/docker/terminal/${encodeURIComponent(container)}`
    
    const ws = new WebSocket(wsUrl)
    wsRef.current = ws

    ws.onopen = () => {
      term.write('\x1b[1;32mConnected to ' + container + ' terminal...\x1b[0m\r\n')
    }

    ws.onmessage = (event) => {
      term.write(event.data)
    }

    ws.onclose = () => {
      term.write('\r\n\x1b[1;31mConnection closed.\x1b[0m\r\n')
    }

    ws.onerror = () => {
      term.write('\r\n\x1b[1;31mWebSocket Error.\x1b[0m\r\n')
    }

    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data)
      }
    })

    const handleResize = () => {
      fitAddon.fit()
    }

    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close()
      }
      term.dispose()
    }
  }, [container])

  if (!container) return null

  return (
    <>
      <div className={`${styles.overlay} ${styles.open}`} onClick={onClose} />
      <div className={`${styles.panel} ${styles.open}`}>
        <div className={styles.header}>
          <span className={styles.title}>Terminal: {container}</span>
          <button className={styles.close} onClick={onClose}>✕</button>
        </div>
        <div className={styles.terminalContainer} ref={terminalRef} />
      </div>
    </>
  )
}
