class OpenAIClient {
  constructor(apiKey, model = 'gpt-4o-mini') {
    if (!apiKey) {
      throw new Error('OpenAI API key is required')
    }
    this.apiKey = apiKey
    this.model = model
    this.endpoint = 'https://api.openai.com/v1/chat/completions'
  }

  async generateSteepTurnFeedback(maneuverData) {
    const systemMessage = this._buildSystemMessage()
    const userMessage = this._buildUserMessage(maneuverData)
    
    const messages = [
      { role: 'system', content: systemMessage },
      { role: 'user', content: userMessage }
    ]

    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: this.model,
          messages: messages,
          temperature: 0.6,
          max_completion_tokens: 300
        })
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`OpenAI API error (${response.status}): ${errorText}`)
      }

      const result = await response.json()
      const content = result?.choices?.[0]?.message?.content?.trim()
      
      if (!content) {
        throw new Error('OpenAI returned an empty response')
      }

      const focusMatch = content.match(/^FOCUS:\s*(.+?)(?:\n|$)/i)
      const focus = focusMatch ? focusMatch[1].trim() : null
      const feedback = focusMatch ? content.replace(/^FOCUS:\s*.+?\n/i, '').trim() : content

      return {
        focus: focus || 'Altitude',
        feedback: feedback
      }
    } catch (error) {
      console.error('[OpenAI] Steep turn feedback request failed:', error)
      throw error
    }
  }

  _buildSystemMessage() {
    return [
      'You are a Certified Flight Instructor (CFI) coaching a pilot immediately after a 360° steep turn.',
      'Use FAA/ACS technique and terminology. Assume the pilot wants actionable corrections, not encouragement.',
      'Output format: Start with "FOCUS: [Area]" on the first line, where [Area] is the single most critical area needing attention (e.g., "Altitude", "Airspeed", "Bank", "Rollout", "Entry").',
      'Then output 3–6 bullet points only (no preamble, no headings, no summary, no restating the data).',
      'Each bullet MUST be a single coaching action with a specific cue (e.g., what to look at, what to change, when to do it).',
      'Keep each bullet under ~20 words. Plain language. No fluff.',
      'Prioritize the biggest performance gaps first using available deviations and busted flags.',
      'Cover these categories when relevant: entry setup, bank/pitch/trim, altitude control, airspeed control, rollout timing, sight picture.',
      'Steep-turn rollout: rollout begins BEFORE the target heading (typically lead by ~½ bank angle) so wings level occurs exactly on entry heading.',
      'NEVER say "begin rollout right turn" or "begin rollout left turn". That wording is incorrect and confusing.',
      'Preferred phrasing: "Begin rollout ~X° early; reduce bank smoothly to wings level on entry heading."',
      'If mentioning control input direction, specify aileron direction as "opposite aileron" (e.g., right turn → left aileron to reduce bank).',
      'If data is missing or noisy, give the most likely high-value corrections based on common steep-turn errors.'
    ].join(' ')
  }
  

  _buildUserMessage(maneuverData) {
    const maneuver = maneuverData.maneuver || maneuverData
    const details = maneuver.details || maneuver
  
    const userContent = {
      maneuverType: maneuverData.maneuverType || 'steep_turn',
      grade: maneuver.grade || maneuverData.grade,
      gradeDetails: maneuver.gradeDetails || maneuverData.gradeDetails,
      entry: details.entry,
      deviations: details.deviations,
      averages: details.averages,
      busted: details.busted,
      turnDirection: details.turnDirection,
      totalTurn: details.totalTurn,
      autoStart: details.autoStart,
      timestamp: details.timestamp
    }
  
    return [
      'Give personalized coaching for this steep turn.',
      'Return ONLY 3–6 crisp bullet tips. No intro. No summary. Do not repeat the data.',
      'Focus on the biggest errors first. If there are busted flags, address them first.',
      'Include rollout timing guidance ONLY if heading/rollout errors exist or totalTurn/rollout suggests late rollout.',
      'Each bullet should be one concrete action + one cue (what to do + what to watch).',
      `Data: ${JSON.stringify(userContent)}`
    ].join(' ')
  }
}  

const apiKey = import.meta.env.VITE_OPENAI_API_KEY
const model = import.meta.env.VITE_OPENAI_MODEL || 'gpt-4o-mini'

let clientInstance = null

function getClient() {
  if (!clientInstance) {
    if (!apiKey) {
      throw new Error('OpenAI API key is not configured. Set VITE_OPENAI_API_KEY environment variable.')
    }
    clientInstance = new OpenAIClient(apiKey, model)
  }
  return clientInstance
}

export async function fetchSteepTurnFeedback(payload) {
  const client = getClient()
  return await client.generateSteepTurnFeedback(payload)
}

