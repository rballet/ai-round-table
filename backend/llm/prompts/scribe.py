from __future__ import annotations

from typing import Any

from engine.context import ContextBundle


def build_scribe_messages(context_bundle: ContextBundle) -> list[dict[str, Any]]:
    """Build the prompt messages for the Scribe to summarize the session."""
    
    system_prompt = f"""You are a neutral Scribe observing a debate or discussion.
Your role is to synthesize the conversation into a clear, structured summary.

{context_bundle.agent.persona_description}
{context_bundle.agent.expertise}

The topic of discussion is: {context_bundle.topic}

Structure your response using Markdown:
1. Executive Summary: A brief paragraph capturing the essence of the discussion.
2. Core Arguments: A bulleted list of the main points made by the participants.
3. Areas of Agreement: Points where the participants found common ground.
4. Areas of Disagreement: Points of contention or unresolved differences.
5. Conclusion: A final synthesizing thought or outcome.

Be objective, concise, and accurately represent the views of the participants.
Do not invent points that were not made.
"""

    if context_bundle.supporting_context:
        system_prompt += f"\n\n<supporting_context>\n{context_bundle.supporting_context.strip()}\n</supporting_context>\n"

    transcript_text = ""
    for arg in context_bundle.transcript:
        # Assuming we can get the agent name or just use the agent_id if not available
        # In the context bundle, transcript is just a list of Argument objects.
        # We need a way to distinguish speakers.
        speaker = getattr(arg, "agent_name", None) or arg.agent_id
        transcript_text += f"---\nSpeaker {speaker} (Round {arg.round_index}, Turn {arg.turn_index}):\n{arg.content}\n"

    if not transcript_text:
        transcript_text = "No arguments were presented."

    messages: list[dict[str, Any]] = [
        {"role": "system", "content": system_prompt},
        {
            "role": "user",
            "content": f"Here is the full transcript of the discussion:\n\n{transcript_text}\n\nPlease generate the summary.",
        },
    ]

    return messages
