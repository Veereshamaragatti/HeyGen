import React, { useRef, useEffect, useState } from 'react'
import StreamingAvatar, { 
  AvatarQuality, 
  StreamingEvents,
  VoiceEmotion 
} from '@heygen/streaming-avatar'
import { supabase, type SessionTiming } from '../lib/supabase'
import { v4 as uuidv4 } from 'uuid'

interface SessionData {
  id: string
  startTime: Date
  endTime?: Date
  duration?: string
}

const HeyGenAvatar: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null)
  const avatarRef = useRef<StreamingAvatar | null>(null)
  const sessionRef = useRef<SessionData | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  
  // Basic states
  const [isConnected, setIsConnected] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [sessions, setSessions] = useState<SessionTiming[]>([])
  const [isRecording, setIsRecording] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [micPermission, setMicPermission] = useState<'granted' | 'denied' | 'prompt'>('prompt')
  const [textInput, setTextInput] = useState('')
  
  // Voice chat states
  const [isVoiceChatActive, setIsVoiceChatActive] = useState(false)
  const [isVoiceChatLoading, setIsVoiceChatLoading] = useState(false)
  const [isMuted, setIsMuted] = useState(true)
  const [chatMode, setChatMode] = useState<'voice' | 'text'>('text')

  // Format time to IST
  const formatToIST = (date: Date): string => {
    return date.toLocaleString('en-US', { 
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    })
  }

  // Calculate duration in mm:ss format
  const calculateDuration = (startTime: Date, endTime: Date): string => {
    const diffMs = endTime.getTime() - startTime.getTime()
    const diffMinutes = Math.floor(diffMs / 60000)
    const diffSeconds = Math.floor((diffMs % 60000) / 1000)
    return `${diffMinutes.toString().padStart(2, '0')}:${diffSeconds.toString().padStart(2, '0')}`
  }

  // Request microphone permission
  const requestMicrophonePermission = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      setMicPermission('granted')
      console.log('🎤 Microphone access granted')
      
      // Stop the stream (we just needed permission)
      stream.getTracks().forEach(track => track.stop())
      return true
    } catch (error) {
      console.error('❌ Microphone access denied:', error)
      setMicPermission('denied')
      return false
    }
  }

  // Voice Chat Functions
  const startVoiceChat = async (isInputAudioMuted?: boolean) => {
    if (!avatarRef.current || !isConnected) {
      console.error('Avatar not connected')
      return
    }

    if (micPermission !== 'granted') {
      const granted = await requestMicrophonePermission()
      if (!granted) return
    }

    try {
      setIsVoiceChatLoading(true)
      console.log('🎤 Starting voice chat...')
      
      await avatarRef.current.startVoiceChat({
        isInputAudioMuted: isInputAudioMuted || false
      })
      
      setIsVoiceChatActive(true)
      setIsMuted(!!isInputAudioMuted)
      setChatMode('voice')
      setIsVoiceChatLoading(false)
      
      console.log('✅ Voice chat started')
      
      // Welcome message for voice chat
      setTimeout(() => {
        speakText("Voice chat is now active! You can speak to me naturally and I'll respond.")
      }, 1000)
    } catch (error) {
      console.error('Error starting voice chat:', error)
      setIsVoiceChatLoading(false)
    }
  }

  const stopVoiceChat = () => {
    if (!avatarRef.current) return
    
    try {
      avatarRef.current.closeVoiceChat()
      setIsVoiceChatActive(false)
      setIsMuted(true)
      setChatMode('text')
      console.log('🛑 Voice chat stopped')
    } catch (error) {
      console.error('Error stopping voice chat:', error)
    }
  }

  const muteInputAudio = () => {
    if (!avatarRef.current || !isVoiceChatActive) return
    
    try {
      avatarRef.current.muteInputAudio()
      setIsMuted(true)
      console.log('🔇 Input audio muted')
    } catch (error) {
      console.error('Error muting input audio:', error)
    }
  }

  const unmuteInputAudio = () => {
    if (!avatarRef.current || !isVoiceChatActive) return
    
    try {
      avatarRef.current.unmuteInputAudio()
      setIsMuted(false)
      console.log('🔊 Input audio unmuted')
    } catch (error) {
      console.error('Error unmuting input audio:', error)
    }
  }

  // Interrupt avatar speaking
  const interrupt = async () => {
    try {
      if (avatarRef.current && isSpeaking) {
        await avatarRef.current.interrupt()
        setIsSpeaking(false)
        console.log('🛑 Avatar interrupted')
      }
    } catch (error) {
      console.error('Error interrupting avatar:', error)
    }
  }

  // Make avatar speak text
  const speakText = async (text: string) => {
    if (!avatarRef.current || !isConnected) {
      console.error('Avatar not connected')
      return
    }

    try {
      setIsSpeaking(true)
      console.log('🗣️ Avatar speaking:', text)
      
      await avatarRef.current.speak({
        text: text,
        taskType: undefined
      })
    } catch (error) {
      console.error('Error making avatar speak:', error)
    } finally {
      setIsSpeaking(false)
    }
  }

  // Start voice recording (legacy)
  const startRecording = async () => {
    if (micPermission !== 'granted') {
      const granted = await requestMicrophonePermission()
      if (!granted) return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream)
      mediaRecorderRef.current = mediaRecorder

      const audioChunks: BlobPart[] = []

      mediaRecorder.ondataavailable = (event) => {
        audioChunks.push(event.data)
      }

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunks, { type: 'audio/wav' })
        console.log('🎵 Audio recorded:', audioBlob)
        
        // For demo, make avatar speak a response
        speakText("I heard you speaking! This is a demo response from legacy recording.")
      }

      mediaRecorder.start()
      setIsRecording(true)
      console.log('🎤 Recording started')
    } catch (error) {
      console.error('Error starting recording:', error)
    }
  }

  // Stop voice recording (legacy)
  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop())
      setIsRecording(false)
      console.log('🛑 Recording stopped')
    }
  }

  // Insert session start to Supabase
  const insertSessionStart = async (sessionId: string, startTime: Date) => {
    try {
      const { error } = await supabase
        .from('session_timing')
        .insert([
          {
            id: sessionId,
            start_time: startTime.toISOString()
          }
        ])

      if (error) {
        console.error('Error inserting session start:', error)
      } else {
        console.log('Session start recorded:', sessionId)
      }
    } catch (error) {
      console.error('Error inserting session start:', error)
    }
  }

  // Update session end to Supabase
  const updateSessionEnd = async (sessionId: string, endTime: Date, duration: string) => {
    try {
      const { error } = await supabase
        .from('session_timing')
        .update({
          end_time: endTime.toISOString(),
          duration: duration
        })
        .eq('id', sessionId)

      if (error) {
        console.error('Error updating session end:', error)
      } else {
        console.log('Session end recorded:', sessionId, duration)
      }
    } catch (error) {
      console.error('Error updating session end:', error)
    }
  }

  // Fetch sessions from Supabase (keep for background functionality)
  const fetchSessions = async () => {
    try {
      const { data, error } = await supabase
        .from('session_timing')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10)

      if (error) {
        console.error('Error fetching sessions:', error)
      } else {
        setSessions(data || [])
      }
    } catch (error) {
      console.error('Error fetching sessions:', error)
    }
  }

  // Initialize avatar
  const initializeAvatar = async () => {
    try {
      setIsLoading(true)
      
      const token = import.meta.env.VITE_HEYGEN_API_TOKEN
      if (!token) {
        throw new Error('HeyGen API token not found')
      }

      avatarRef.current = new StreamingAvatar({ token })

      // Setup event listeners
      avatarRef.current.on(StreamingEvents.STREAM_READY, (event) => {
        console.log('🚀 Stream ready:', event)
        
        // Record session start
        const startTime = new Date()
        const sessionId = uuidv4()
        
        sessionRef.current = {
          id: sessionId,
          startTime: startTime
        }

        insertSessionStart(sessionId, startTime)
        
        console.log(`Session started: ${sessionId} at ${formatToIST(startTime)}`)
        
        // Set video stream with audio enabled
        if (videoRef.current && event.detail) {
          videoRef.current.srcObject = event.detail
          videoRef.current.muted = false
          videoRef.current.volume = 1.0
          videoRef.current.play()
        }
        
        setIsConnected(true)
        setIsLoading(false)
        
        // Welcome message
        setTimeout(() => {
          speakText("Hello! I'm your AI avatar. You can chat with me using text or voice!")
        }, 1000)
      })

      avatarRef.current.on(StreamingEvents.STREAM_DISCONNECTED, () => {
        console.log('⛔ Stream disconnected')
        
        // Stop voice chat if active
        if (isVoiceChatActive) {
          setIsVoiceChatActive(false)
          setIsMuted(true)
          setChatMode('text')
        }
        
        if (sessionRef.current) {
          const endTime = new Date()
          const duration = calculateDuration(sessionRef.current.startTime, endTime)
          
          updateSessionEnd(sessionRef.current.id, endTime, duration)
          
          console.log(`Session ended: ${sessionRef.current.id} at ${formatToIST(endTime)}, Duration: ${duration}`)
          
          sessionRef.current = null
        }
        
        setIsConnected(false)
        fetchSessions() // Still fetch in background for data tracking
      })

      // Avatar speaking events
      avatarRef.current.on(StreamingEvents.AVATAR_START_TALKING, () => {
        console.log('🗣️ Avatar started talking')
        setIsSpeaking(true)
      })

      avatarRef.current.on(StreamingEvents.AVATAR_STOP_TALKING, () => {
        console.log('🤐 Avatar stopped talking')
        setIsSpeaking(false)
      })

      // Voice chat events
      avatarRef.current.on(StreamingEvents.USER_START, () => {
        console.log('👤 User started speaking')
      })

      avatarRef.current.on(StreamingEvents.USER_STOP, () => {
        console.log('👤 User stopped speaking')
      })

      // Start avatar session with knowledge base
      await avatarRef.current.createStartAvatar({
        quality: AvatarQuality.Low,
        avatarName: 'Bryan_IT_Sitting_public',
        voice: {
          rate: 1.0,
          emotion: VoiceEmotion.EXCITED,
        },
        language: 'en',
        knowledgeId: '119141f46bfc42829a076b1c432294b5',
      })

    } catch (error) {
      console.error('Error initializing avatar:', error)
      setIsLoading(false)
    }
  }

  // Stop avatar session
  const stopAvatar = async () => {
    try {
      // Stop voice chat if active
      if (isVoiceChatActive) {
        stopVoiceChat()
      }
      
      if (avatarRef.current) {
        await avatarRef.current.stopAvatar()
        avatarRef.current = null
      }
      
      // Stop recording if active
      if (isRecording) {
        stopRecording()
      }
    } catch (error) {
      console.error('Error stopping avatar:', error)
    }
  }

  // Handle text input speak
  const handleTextSpeak = () => {
    if (textInput.trim()) {
      speakText(textInput)
      setTextInput('')
    }
  }

  // Toggle chat mode
  const toggleChatMode = (mode: 'voice' | 'text') => {
    if (mode === 'voice' && chatMode === 'text' && !isVoiceChatActive && !isVoiceChatLoading) {
      startVoiceChat(false)
    } else if (mode === 'text' && chatMode === 'voice' && isVoiceChatActive && !isVoiceChatLoading) {
      stopVoiceChat()
    }
  }

  // Load sessions on component mount
  useEffect(() => {
    fetchSessions() // Still fetch for background tracking
    // Request microphone permission on load
    requestMicrophonePermission()
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (avatarRef.current) {
        stopAvatar()
      }
    }
  }, [])

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">HeyGen Avatar Session Tracker</h1>
      
      {/* Avatar Video */}
      <div className="mb-6">
        <div className="aspect-video bg-gray-900 rounded-lg overflow-hidden relative">
          {!isConnected && !isLoading && (
            <div className="absolute inset-0 flex items-center justify-center">
              <p className="text-gray-400">Avatar not connected</p>
            </div>
          )}
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center">
              <p className="text-blue-400">Connecting...</p>
            </div>
          )}
          
          {/* Status indicators */}
          <div className="absolute top-4 right-4 flex flex-col gap-2">
            {isSpeaking && (
              <div className="bg-green-500 text-white px-3 py-1 rounded-full text-sm">
                🗣️ Speaking
              </div>
            )}
            {isVoiceChatActive && (
              <div className="bg-blue-500 text-white px-3 py-1 rounded-full text-sm">
                🎤 Voice Chat
              </div>
            )}
            {isVoiceChatActive && !isMuted && (
              <div className="bg-green-500 text-white px-3 py-1 rounded-full text-sm animate-pulse">
                🎙️ Listening
              </div>
            )}
          </div>
          
          {/* Interrupt button */}
          {isSpeaking && (
            <div className="absolute bottom-4 right-4">
              <button
                onClick={interrupt}
                className="bg-zinc-700 text-white px-4 py-2 rounded-lg hover:bg-zinc-600"
              >
                Interrupt
              </button>
            </div>
          )}
          
          <video
            ref={videoRef}
            className="w-full h-full object-cover"
            autoPlay
            playsInline
            muted={false}
            controls={false}
          />
        </div>
      </div>

      {/* Chat Mode Toggle */}
      <div className="mb-6 flex justify-center">
        <div className={`bg-zinc-700 rounded-lg p-1 inline-flex ${isVoiceChatLoading ? "opacity-50" : ""}`}>
          <button
            disabled={isVoiceChatLoading || !isConnected}
            className={`rounded-lg p-2 text-sm w-[90px] text-center transition-colors ${
              chatMode === 'voice' ? 'bg-zinc-800 text-white' : 'text-gray-300 hover:text-white'
            }`}
            onClick={() => toggleChatMode('voice')}
          >
            {isVoiceChatLoading ? 'Loading...' : 'Voice Chat'}
          </button>
          <button
            disabled={isVoiceChatLoading}
            className={`rounded-lg p-2 text-sm w-[90px] text-center transition-colors ${
              chatMode === 'text' ? 'bg-zinc-800 text-white' : 'text-gray-300 hover:text-white'
            }`}
            onClick={() => toggleChatMode('text')}
          >
            Text Chat
          </button>
        </div>
      </div>

      {/* Knowledge Base Info */}
      <div className="mb-4 p-3 bg-green-50 rounded-lg">
        <p className="text-sm text-green-700">
          🧠 <strong>Knowledge Base Connected:</strong> Avatar has access to your custom knowledge base (ID: 119141f46bfc42829a076b1c432294b5)
        </p>
      </div>

      {/* Voice Chat Status & Controls */}
      {chatMode === 'voice' && (
        <div className="mb-6 p-4 bg-blue-50 rounded-lg">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold">Voice Chat Status</h3>
            {isVoiceChatActive && (
              <button
                onClick={isMuted ? unmuteInputAudio : muteInputAudio}
                className={`px-3 py-1 text-xs rounded ${
                  isMuted 
                    ? 'bg-red-100 text-red-700 hover:bg-red-200' 
                    : 'bg-green-100 text-green-700 hover:bg-green-200'
                }`}
              >
                {isMuted ? '🔇 Unmute' : '🔊 Mute'}
              </button>
            )}
          </div>
          <div className="space-y-2 text-sm">
            <p>Status: <span className="font-medium text-blue-600">
              {isVoiceChatActive ? 'Active - Speak naturally!' : 'Inactive'}
            </span></p>
            <p>Audio Input: <span className={`font-medium ${!isMuted ? 'text-green-600' : 'text-red-600'}`}>
              {!isMuted ? 'Enabled' : 'Muted'}
            </span></p>
            <p className="text-gray-600">
              💡 Tip: Ask questions related to your knowledge base! The avatar will use your custom data to respond.
            </p>
          </div>
        </div>
      )}

      {/* Microphone Status */}
      <div className="mb-4 p-3 bg-blue-50 rounded-lg">
        <p className="text-sm">
          🎤 Microphone: 
          <span className={`ml-2 font-medium ${
            micPermission === 'granted' ? 'text-green-600' : 
            micPermission === 'denied' ? 'text-red-600' : 'text-yellow-600'
          }`}>
            {micPermission === 'granted' ? 'Enabled' : 
             micPermission === 'denied' ? 'Denied' : 'Not requested'}
          </span>
        </p>
      </div>

      {/* Text Input for Speaking (only show in text mode) */}
      {chatMode === 'text' && (
        <div className="mb-6 p-4 bg-gray-50 rounded-lg">
          <h3 className="font-semibold mb-3">Make Avatar Speak</h3>
          <div className="flex gap-2">
            <input
              type="text"
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              placeholder="Ask questions about your knowledge base or type anything..."
              className="flex-1 px-3 py-2 border rounded-lg"
              onKeyPress={(e) => e.key === 'Enter' && handleTextSpeak()}
            />
            <button
              onClick={handleTextSpeak}
              disabled={!isConnected || !textInput.trim() || isSpeaking}
              className="px-4 py-2 bg-purple-600 text-white rounded-lg disabled:opacity-50 hover:bg-purple-700"
            >
              {isSpeaking ? 'Speaking...' : 'Speak'}
            </button>
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="flex gap-4 mb-6 flex-wrap">
        <button
          onClick={initializeAvatar}
          disabled={isConnected || isLoading}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-700"
        >
          {isLoading ? 'Connecting...' : 'Start Avatar'}
        </button>
        
        <button
          onClick={stopAvatar}
          disabled={!isConnected}
          className="px-6 py-2 bg-red-600 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-red-700"
        >
          Stop Avatar
        </button>

        {/* Legacy Recording Button (for manual testing) */}
        <button
          onClick={isRecording ? stopRecording : startRecording}
          disabled={!isConnected || micPermission !== 'granted' || isVoiceChatActive}
          className={`px-6 py-2 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed ${
            isRecording ? 'bg-red-500 hover:bg-red-600' : 'bg-gray-600 hover:bg-gray-700'
          }`}
        >
          {isRecording ? '🛑 Stop Legacy Recording' : '🎤 Legacy Recording'}
        </button>

        <button
          onClick={fetchSessions}
          className="px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
        >
          Refresh Sessions
        </button>
      </div>

      {/* Session Status */}
      <div className="mb-6 p-4 bg-gray-100 rounded-lg">
        <h3 className="font-semibold mb-2">Current Session Status</h3>
        <p>Connection: <span className={`font-medium ${isConnected ? 'text-green-600' : 'text-red-600'}`}>
          {isConnected ? 'Connected' : 'Disconnected'}
        </span></p>
        {sessionRef.current && (
          <p>Session ID: <span className="font-mono text-sm">{sessionRef.current.id}</span></p>
        )}
        <p>Chat Mode: <span className={`font-medium ${chatMode === 'voice' ? 'text-blue-600' : 'text-purple-600'}`}>
          {chatMode === 'voice' ? 'Voice Chat' : 'Text Chat'}
        </span></p>
        <p>Voice Chat: <span className={`font-medium ${isVoiceChatActive ? 'text-green-600' : 'text-gray-600'}`}>
          {isVoiceChatActive ? 'Active' : 'Inactive'}
        </span></p>
        <p>Legacy Recording: <span className={`font-medium ${isRecording ? 'text-red-600' : 'text-gray-600'}`}>
          {isRecording ? 'Active' : 'Inactive'}
        </span></p>
      </div>
    </div>
  )
}

export default HeyGenAvatar