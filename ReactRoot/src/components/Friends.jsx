import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import './Friends.css'

export default function Friends({ user }) {
  const [friends, setFriends] = useState([])
  const [pendingInvites, setPendingInvites] = useState([])
  const [sentInvites, setSentInvites] = useState([])
  const [inviteEmail, setInviteEmail] = useState('')
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('friends') // 'friends', 'pending', 'sent'

  useEffect(() => {
    loadRelationships()
  }, [user.id])

  async function loadRelationships() {
    try {
      // Get relationships where user is student (instructor can view)
      const { data: asStudent, error: e1 } = await supabase
        .from('instructor_relationships')
        .select('*')
        .eq('student_id', user.id)

      // Get relationships where user is instructor (can view students)
      const { data: asInstructor, error: e2 } = await supabase
        .from('instructor_relationships')
        .select('*')
        .eq('instructor_id', user.id)

      if (e1 || e2) {
        console.error('Error loading relationships:', e1 || e2)
        return
      }

      // Collect all user IDs we need to look up
      const userIds = new Set()
      asStudent?.forEach(rel => userIds.add(rel.instructor_id))
      asInstructor?.forEach(rel => userIds.add(rel.student_id))

      // Fetch user profiles for all related users
      const { data: profiles, error: profileError } = await supabase
        .from('user_profiles')
        .select('user_id, email')
        .in('user_id', Array.from(userIds))

      if (profileError) {
        console.error('Error loading profiles:', profileError)
      }

      // Create a map for quick lookup
      const profileMap = new Map()
      profiles?.forEach(profile => {
        profileMap.set(profile.user_id, profile)
      })

      const accepted = []
      const pending = []
      const sent = []

      // Process as student (instructors viewing you)
      asStudent?.forEach(rel => {
        const otherUser = profileMap.get(rel.instructor_id) || { id: rel.instructor_id, email: 'Unknown' }
        
        if (rel.status === 'accepted') {
          accepted.push({
            ...rel,
            otherUser,
            role: 'instructor',
            relationshipId: rel.id
          })
        } else if (rel.status === 'pending' && rel.invited_by === user.id) {
          sent.push({
            ...rel,
            otherUser,
            role: 'instructor',
            relationshipId: rel.id
          })
        } else if (rel.status === 'pending') {
          pending.push({
            ...rel,
            otherUser,
            role: 'instructor',
            relationshipId: rel.id
          })
        }
      })

      // Process as instructor (students you can view)
      asInstructor?.forEach(rel => {
        const otherUser = profileMap.get(rel.student_id) || { id: rel.student_id, email: 'Unknown' }
        
        if (rel.status === 'accepted') {
          accepted.push({
            ...rel,
            otherUser,
            role: 'student',
            relationshipId: rel.id
          })
        } else if (rel.status === 'pending' && rel.invited_by === user.id) {
          sent.push({
            ...rel,
            otherUser,
            role: 'student',
            relationshipId: rel.id
          })
        } else if (rel.status === 'pending') {
          pending.push({
            ...rel,
            otherUser,
            role: 'student',
            relationshipId: rel.id
          })
        }
      })

      console.log('Loaded relationships:', {
        asStudent: asStudent?.length || 0,
        asInstructor: asInstructor?.length || 0,
        accepted: accepted.length,
        pending: pending.length,
        sent: sent.length
      })

      setFriends(accepted)
      setPendingInvites(pending)
      setSentInvites(sent)
    } catch (error) {
      console.error('Error loading relationships:', error)
    } finally {
      setLoading(false)
    }
  }

  async function sendInvite(email) {
    if (!email || !email.includes('@')) {
      alert('Please enter a valid email address')
      return
    }

    try {
      // Find user by email in user_profiles
      const { data: profile, error: findError } = await supabase
        .from('user_profiles')
        .select('user_id, email')
        .eq('email', email.toLowerCase().trim())
        .single()

      if (findError || !profile) {
        alert('User not found. They need to sign up first.')
        return
      }

      const otherUserId = profile.user_id

      if (otherUserId === user.id) {
        alert('You cannot invite yourself')
        return
      }

      // Check if relationship already exists
      const { data: existing } = await supabase
        .from('instructor_relationships')
        .select('*')
        .or(`and(student_id.eq.${user.id},instructor_id.eq.${otherUserId}),and(student_id.eq.${otherUserId},instructor_id.eq.${user.id})`)
        .single()

      if (existing) {
        alert('You already have a relationship with this user')
        return
      }

      // Create relationship (user invites other as instructor)
      const { error } = await supabase
        .from('instructor_relationships')
        .insert({
          student_id: user.id,
          instructor_id: otherUserId,
          status: 'pending',
          invited_by: user.id
        })

      if (error) {
        console.error('Error sending invite:', error)
        alert('Error sending invite: ' + error.message)
        return
      }

      alert('Invite sent! They will see it in their Friends page.')
      setInviteEmail('')
      loadRelationships()
    } catch (error) {
      console.error('Error sending invite:', error)
      alert('Error sending invite')
    }
  }

  async function acceptInvite(relationshipId) {
    try {
      const { error } = await supabase
        .from('instructor_relationships')
        .update({ status: 'accepted' })
        .eq('id', relationshipId)

      if (error) {
        console.error('Error accepting invite:', error)
        return
      }

      loadRelationships()
    } catch (error) {
      console.error('Error accepting invite:', error)
    }
  }

  async function declineInvite(relationshipId) {
    try {
      const { error } = await supabase
        .from('instructor_relationships')
        .delete()
        .eq('id', relationshipId)

      if (error) {
        console.error('Error declining invite:', error)
        return
      }

      loadRelationships()
    } catch (error) {
      console.error('Error declining invite:', error)
    }
  }

  async function removeFriend(relationshipId) {
    if (!confirm('Remove this friend/instructor?')) return

    try {
      const { error } = await supabase
        .from('instructor_relationships')
        .delete()
        .eq('id', relationshipId)

      if (error) {
        console.error('Error removing friend:', error)
        return
      }

      loadRelationships()
    } catch (error) {
      console.error('Error removing friend:', error)
    }
  }

  if (loading) {
    return (
      <div className="friends-page">
        <div className="friends-container">
          <h1>Loading...</h1>
        </div>
      </div>
    )
  }

  return (
    <div className="friends-page">
      <div className="friends-container">
        <h1>Friends & Instructors</h1>
        <p className="subtitle">Share your progress with instructors or friends</p>

        <div className="invite-section">
          <h2>Invite Instructor/Friend</h2>
          <div className="invite-form">
            <input
              type="email"
              placeholder="Enter their email address"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && sendInvite(inviteEmail)}
            />
            <button onClick={() => sendInvite(inviteEmail)}>
              Send Invite
            </button>
          </div>
          <p className="invite-hint">
            They'll be able to view your maneuver history and progress charts
          </p>
        </div>

        <div className="tabs">
          <button
            className={`tab ${activeTab === 'friends' ? 'active' : ''}`}
            onClick={() => setActiveTab('friends')}
          >
            Connected ({friends.length})
          </button>
          <button
            className={`tab ${activeTab === 'pending' ? 'active' : ''}`}
            onClick={() => setActiveTab('pending')}
          >
            Pending ({pendingInvites.length})
          </button>
          <button
            className={`tab ${activeTab === 'sent' ? 'active' : ''}`}
            onClick={() => setActiveTab('sent')}
          >
            Sent ({sentInvites.length})
          </button>
        </div>

        {activeTab === 'friends' && (
          <div className="friends-list">
            {friends.length === 0 ? (
              <div className="empty-state">
                <p>No connections yet. Send an invite to get started!</p>
              </div>
            ) : (
              friends.map(friend => (
                <div key={friend.relationshipId} className="friend-card">
                  <div className="friend-info">
                    <div className="friend-email">{friend.otherUser?.email || 'Unknown'}</div>
                    <div className="friend-role">
                      {friend.role === 'instructor' ? '👨‍🏫 Instructor' : '👨‍🎓 Student'}
                    </div>
                  </div>
                  <div className="friend-actions">
                    {friend.role === 'student' && (
                      <Link
                        to={`/view-student/${friend.otherUser?.id}`}
                        className="view-btn"
                      >
                        View Progress
                      </Link>
                    )}
                    <button
                      className="remove-btn"
                      onClick={() => removeFriend(friend.relationshipId)}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'pending' && (
          <div className="friends-list">
            {pendingInvites.length === 0 ? (
              <div className="empty-state">
                <p>No pending invites</p>
              </div>
            ) : (
              pendingInvites.map(invite => (
                <div key={invite.relationshipId} className="friend-card">
                  <div className="friend-info">
                    <div className="friend-email">{invite.otherUser?.email || 'Unknown'}</div>
                    <div className="friend-role">
                      {invite.role === 'instructor' ? '👨‍🏫 Wants to view your progress' : '👨‍🎓 Student invite'}
                    </div>
                  </div>
                  <div className="friend-actions">
                    <button
                      className="accept-btn"
                      onClick={() => acceptInvite(invite.relationshipId)}
                    >
                      Accept
                    </button>
                    <button
                      className="decline-btn"
                      onClick={() => declineInvite(invite.relationshipId)}
                    >
                      Decline
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'sent' && (
          <div className="friends-list">
            {sentInvites.length === 0 ? (
              <div className="empty-state">
                <p>No sent invites</p>
              </div>
            ) : (
              sentInvites.map(invite => (
                <div key={invite.relationshipId} className="friend-card">
                  <div className="friend-info">
                    <div className="friend-email">{invite.otherUser?.email || 'Unknown'}</div>
                    <div className="friend-status">Pending...</div>
                  </div>
                  <button
                    className="cancel-btn"
                    onClick={() => declineInvite(invite.relationshipId)}
                  >
                    Cancel
                  </button>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  )
}

