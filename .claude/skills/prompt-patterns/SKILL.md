---
name: prompt-patterns
description: >
  LLM prompt structure and patterns for AI Round Table. Load when writing or
  modifying prompt templates in backend/llm/prompts/.
---

## ContextBundle Fields (available to all prompts)
```python
@dataclass
class ContextBundle:
    topic: str
    prompt: str                      # original human question
    supporting_context: str | None   # host-provided background
    agent: Agent                     # display_name, persona_description, expertise
    current_thought: str | None      # agent's latest private thought
    transcript: list[Argument]       # public arguments so far
    round_index: int
    turn_index: int
```

## Transcript Formatting Helper
```python
def format_transcript(transcript: list[Argument]) -> str:
    return "\n\n".join(
        f"**{a.agent_name}** (Round {a.round_index}, Turn {a.turn_index}):\n{a.content}"
        for a in transcript
    )
```

## JSON-Returning Prompts (Decide, Moderator)
Always end the user turn with:
```
Respond with ONLY valid JSON. No preamble, no explanation, no markdown fences.
```

Always wrap parsing in retry logic:
```python
try:
    return json.loads(response)
except json.JSONDecodeError:
    response = await retry_with_json_reminder(...)
    return json.loads(response)
```

## Prompt Structure Per Phase

### Think
```
[SYSTEM] You are {display_name}. {persona_description}
Your expertise: {expertise}
Form your INITIAL, INDEPENDENT position. You have not yet heard others.

[USER] Topic: {topic}
Question: {prompt}
{supporting_context}
Provide your initial thought: position, 2-3 strongest arguments, anticipated counterarguments.
Format: structured paragraphs, no bullet points.
```

### Argue
```
[SYSTEM] You are {display_name}. {persona_description}
You have the token. Argue from your current position.
Be direct, specific, concise. No repetition. Max 200 words.

[USER] Topic: {topic} | Question: {prompt}
Your current position: {current_thought}
Discussion so far: {format_transcript(transcript)}
Now give your argument.
```

### Decide (returns JSON)
```
[SYSTEM] You are {display_name}. Request the token ONLY for:
(a) A material factual error to correct, OR (b) Genuinely new information not yet discussed.
Do NOT request to repeat, rephrase, or lightly reinforce.

[USER] Your updated position: {current_thought}
Last argument: {last_argument}
Full transcript: {transcript}

Respond with ONLY a JSON object:
{"request_token": true|false, "novelty_tier": "factual_correction|new_information|disagreement|synthesis|reinforcement", "justification": "one sentence"}
```

### Moderator Convergence (returns JSON)
```
[SYSTEM] You are a neutral moderator. No opinions. Assess discussion state only.

[USER] Topic: {topic} | Threshold: {convergence_majority} | Round: {round_index}/{max_rounds}
Transcript: {transcript}
Claim registry: {moderator_state.claim_registry}

Tasks: 1) Extract new claims. 2) Update alignment map. 3) Assess majority. 4) Assess novelty.
Respond with ONLY:
{"new_claims": [...], "alignment_updates": {...}, "majority_reached": bool, "dominant_position": "...|null", "novel_information_present": bool}
```

### Scribe
```
[SYSTEM] You are a precise technical writer. Summarise without opinion.

[USER] Topic: {topic} | Termination: {reason}
Full transcript: {transcript}
Moderator state: {moderator_state}
Write a structured summary: winning argument/consensus, key points of contention, each agent's final position.
```

## Tone Guidelines
| Phase | Tone |
|---|---|
| Think | Introspective, first-person, exploratory |
| Argue | Assertive, direct, max 200 words, no prior repetition |
| Decide | Analytical, binary output, honest self-assessment |
| Moderator | Neutral, analytical, never "I think", no preference |
| Scribe | Precise, structured, complete but concise |
