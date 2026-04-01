/**
 * TIER 2 — DAO Governance Service
 * Active DAO proposals and voting across major protocols via Snapshot
 *
 * Sources (free, no auth):
 *   - Snapshot GraphQL: https://hub.snapshot.org/graphql
 */

import axios from "axios";

const SNAPSHOT_GQL = "https://hub.snapshot.org/graphql";

const PROPOSALS_QUERY = `
  query ActiveProposals {
    proposals(
      first: 30
      skip: 0
      where: { state: "active" }
      orderBy: "created"
      orderDirection: desc
    ) {
      id
      title
      body
      choices
      start
      end
      state
      scores
      scores_total
      votes
      quorum
      space {
        id
        name
        followersCount
      }
      author
      type
    }
  }
`;

const CLOSED_QUERY = `
  query RecentClosed {
    proposals(
      first: 20
      skip: 0
      where: { state: "closed" }
      orderBy: "end"
      orderDirection: desc
    ) {
      id
      title
      choices
      scores
      scores_total
      votes
      end
      state
      space {
        id
        name
      }
    }
  }
`;

async function fetchProposals(query) {
  const { data } = await axios.post(
    SNAPSHOT_GQL,
    { query },
    {
      timeout: 12000,
      headers: { "Content-Type": "application/json" },
    }
  );
  return data?.data?.proposals || [];
}

function summarizeProposal(p) {
  const endDate    = new Date(p.end * 1000);
  const hoursLeft  = Math.max(0, Math.round((endDate - Date.now()) / 3600000));
  const topChoice  = p.choices && p.scores
    ? p.choices[p.scores.indexOf(Math.max(...p.scores))]
    : null;
  const leadingPct = p.scores_total > 0 && p.scores
    ? +((Math.max(...p.scores) / p.scores_total) * 100).toFixed(1)
    : null;
  return {
    id:           p.id,
    title:        p.title?.slice(0, 150),
    protocol:     p.space?.name,
    spaceId:      p.space?.id,
    followers:    p.space?.followersCount || 0,
    choices:      p.choices || [],
    votes:        p.votes,
    scoresTotal:  +( p.scores_total || 0).toFixed(0),
    leadingChoice: topChoice,
    leadingPct,
    endsAt:       new Date(p.end * 1000).toISOString(),
    hoursRemaining: hoursLeft,
    quorumRequired: p.quorum || null,
    state:        p.state,
    url:          `https://snapshot.org/#/${p.space?.id}/proposal/${p.id}`,
    urgency:      hoursLeft < 24 ? "CLOSING_SOON" : hoursLeft < 72 ? "ACTIVE" : "OPEN",
  };
}

export async function daoGovernance(req, res) {
  const { protocol } = req.query;

  const [active, closed] = await Promise.all([
    fetchProposals(PROPOSALS_QUERY).catch(() => []),
    fetchProposals(CLOSED_QUERY).catch(() => []),
  ]);

  let activeList = active.map(summarizeProposal);
  let closedList = closed.map(p => {
    const topChoice  = p.choices && p.scores ? p.choices[p.scores.indexOf(Math.max(...p.scores))] : null;
    const leadingPct = p.scores_total > 0 && p.scores ? +((Math.max(...p.scores) / p.scores_total) * 100).toFixed(1) : null;
    return {
      id:           p.id,
      title:        p.title?.slice(0, 150),
      protocol:     p.space?.name,
      spaceId:      p.space?.id,
      choices:      p.choices,
      votes:        p.votes,
      result:       topChoice,
      leadingPct,
      closedAt:     new Date(p.end * 1000).toISOString(),
      url:          `https://snapshot.org/#/${p.space?.id}/proposal/${p.id}`,
    };
  });

  if (protocol) {
    const pLow = protocol.toLowerCase();
    activeList = activeList.filter(p => p.spaceId?.toLowerCase().includes(pLow) || p.protocol?.toLowerCase().includes(pLow));
    closedList = closedList.filter(p => p.spaceId?.toLowerCase().includes(pLow) || p.protocol?.toLowerCase().includes(pLow));
  }

  const closingSoon = activeList.filter(p => p.urgency === "CLOSING_SOON");
  const protocols   = [...new Set(activeList.map(p => p.protocol).filter(Boolean))];

  res.json({
    status: "ok",
    summary: {
      activeProposals:   activeList.length,
      closingSoon:       closingSoon.length,
      recentlyClosed:    closedList.length,
      activeProtocols:   protocols.length,
    },
    active:  activeList,
    closed:  closedList.slice(0, 10),
    closingSoon,
    meta: {
      sources:     ["hub.snapshot.org/graphql"],
      generatedAt: new Date().toISOString(),
    },
  });
}
