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
  
  const [isConnected, setIsConnected] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [sessions, setSessions] = useState<SessionTiming[]>([])
  const [isRecording, setIsRecording] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [micPermission, setMicPermission] = useState<'granted' | 'denied' | 'prompt'>('prompt')
  const [textInput, setTextInput] = useState('')

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
        taskType: undefined // or remove this line if not needed, or use the correct TaskType enum if available
      })
    } catch (error) {
      console.error('Error making avatar speak:', error)
    } finally {
      setIsSpeaking(false)
    }
  }

  // Start voice recording
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
        // Here you would typically send this to a speech-to-text service
        console.log('🎵 Audio recorded:', audioBlob)
        
        // For demo, make avatar speak a response
        speakText("I heard you speaking! This is a demo response.")
      }

      mediaRecorder.start()
      setIsRecording(true)
      console.log('🎤 Recording started')
    } catch (error) {
      console.error('Error starting recording:', error)
    }
  }

  // Stop voice recording
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

  // Fetch sessions from Supabase
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
          videoRef.current.muted = false // Ensure audio is enabled
          videoRef.current.volume = 1.0 // Set volume to maximum
          videoRef.current.play()
        }
        
        setIsConnected(true)
        setIsLoading(false)
        
        // Welcome message
        setTimeout(() => {
          speakText("Hello! I'm your AI avatar. I can hear and speak with you!")
        }, 1000)
      })

      avatarRef.current.on(StreamingEvents.STREAM_DISCONNECTED, () => {
        console.log('⛔ Stream disconnected')
        
        if (sessionRef.current) {
          const endTime = new Date()
          const duration = calculateDuration(sessionRef.current.startTime, endTime)
          
          updateSessionEnd(sessionRef.current.id, endTime, duration)
          
          console.log(`Session ended: ${sessionRef.current.id} at ${formatToIST(endTime)}, Duration: ${duration}`)
          
          sessionRef.current = null
        }
        
        setIsConnected(false)
        fetchSessions()
      })

      // Add speaking events
      avatarRef.current.on(StreamingEvents.AVATAR_START_TALKING, () => {
        console.log('🗣️ Avatar started talking')
        setIsSpeaking(true)
      })

      avatarRef.current.on(StreamingEvents.AVATAR_STOP_TALKING, () => {
        console.log('🤐 Avatar stopped talking')
        setIsSpeaking(false)
      })

      // Start avatar session
      await avatarRef.current.createStartAvatar({
        quality: AvatarQuality.Low,
        avatarName: 'Bryan_IT_Sitting_public',
        voice: {
          rate: 1.0,
          emotion: VoiceEmotion.EXCITED,
        },
        language: 'en',
      })

    } catch (error) {
      console.error('Error initializing avatar:', error)
      setIsLoading(false)
    }
  }

  // Stop avatar session
  const stopAvatar = async () => {
    try {
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

  // Load sessions on component mount
  useEffect(() => {
    fetchSessions()
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
          {isSpeaking && (
            <div className="absolute top-4 right-4 bg-green-500 text-white px-3 py-1 rounded-full text-sm">
              🗣️ Speaking
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

      {/* Text Input for Speaking */}
      <div className="mb-6 p-4 bg-gray-50 rounded-lg">
        <h3 className="font-semibold mb-3">Make Avatar Speak</h3>
        <div className="flex gap-2">
          <input
            type="text"
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            placeholder="Type what you want the avatar to say..."
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

      {/* Controls */}
      <div className="flex gap-4 mb-6">
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

        <button
          onClick={isRecording ? stopRecording : startRecording}
          disabled={!isConnected || micPermission !== 'granted'}
          className={`px-6 py-2 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed ${
            isRecording ? 'bg-red-500 hover:bg-red-600' : 'bg-green-600 hover:bg-green-700'
          }`}
        >
          {isRecording ? '🛑 Stop Recording' : '🎤 Start Recording'}
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
        <p>Status: <span className={`font-medium ${isConnected ? 'text-green-600' : 'text-red-600'}`}>
          {isConnected ? 'Connected' : 'Disconnected'}
        </span></p>
        {sessionRef.current && (
          <p>Session ID: <span className="font-mono text-sm">{sessionRef.current.id}</span></p>
        )}
        <p>Recording: <span className={`font-medium ${isRecording ? 'text-red-600' : 'text-gray-600'}`}>
          {isRecording ? 'Active' : 'Inactive'}
        </span></p>
      </div>

      {/* Sessions History */}
      <div>
        <h3 className="text-xl font-semibold mb-4">Recent Sessions</h3>
        <div className="space-y-3">
          {sessions.map((session) => (
            <div key={session.id} className="p-4 border rounded-lg">
              <p><strong>Session ID:</strong> <span className="font-mono text-sm">{session.id}</span></p>
              <p><strong>Start Time (IST):</strong> {new Date(session.start_time).toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })}</p>
              {session.end_time && (
                <>
                  <p><strong>End Time (IST):</strong> {new Date(session.end_time).toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })}</p>
                  <p><strong>Duration:</strong> {session.duration}</p>
                </>
              )}
              {!session.end_time && (
                <p className="text-yellow-600"><strong>Status:</strong> Active</p>
              )}
            </div>
          ))}
          {sessions.length === 0 && (
            <p className="text-gray-500">No sessions found</p>
          )}
        </div>
      </div>
    </div>
  )
}

export default HeyGenAvatar