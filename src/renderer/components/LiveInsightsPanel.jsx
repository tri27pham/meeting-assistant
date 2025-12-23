import React from "react";
import {
  SparkleIcon,
  CopyIcon,
  BookIcon,
  GlobeIcon,
  ChatIcon,
  LightbulbIcon,
  HelpCircleIcon,
} from "./Icons";

function LiveInsightsPanel({
  insights,
  actions,
  selectedAction,
  onActionSelect,
  onCopyInsights,
}) {
  // Debug: Log actions to verify they're being passed
  React.useEffect(() => {
    console.log('[LiveInsightsPanel] Actions received:', { 
      count: actions?.length, 
      actions,
      actionIds: actions?.map(a => a.id),
      actionLabels: actions?.map(a => a.label),
      actionDetails: actions?.map(a => ({ id: a.id, label: a.label, icon: a.icon, hasLabel: !!a.label, labelLength: a.label?.length }))
    });
  }, [actions]);

  // Force re-render when actions change
  const actionsKey = React.useMemo(() => {
    return actions?.map(a => a.id).join(',') || 'empty';
  }, [actions]);

  const getActionIcon = (iconType) => {
    switch (iconType) {
      case "book":
        return <BookIcon />;
      case "globe":
        return <GlobeIcon />;
      case "chat":
        return <ChatIcon />;
      case "sparkle":
        return <SparkleIcon />;
      case "lightbulb":
        return <LightbulbIcon />;
      case "help-circle":
        return <HelpCircleIcon />;
      default:
        return <SparkleIcon />;
    }
  };

  const handleCopy = () => {
    const text = `${insights.title}\n\n${insights.summary}${insights.context ? "\n\n" + insights.context : ""}`;
    navigator.clipboard.writeText(text);
    onCopyInsights?.();
  };

  return (
    <div className="live-insights-panel glass-panel">
      {/* Header */}
      <div className="panel-header">
        <div className="panel-title">
          <SparkleIcon className="title-icon" />
          <span>Live insights</span>
        </div>
        <div className="panel-actions">
          <button
            className="header-btn icon-only"
            onClick={handleCopy}
            aria-label="Copy insights"
          >
            <CopyIcon />
          </button>
        </div>
      </div>

          <div className="insights-content">
            <h3 className="insights-title">{insights.title}</h3>
            <p className="insights-summary">{insights.summary}</p>
            {insights.context && (
              <p className="insights-context">{insights.context}</p>
            )}
          </div>

          <div className="actions-section">
            <h4 className="actions-title">Actions</h4>
            <div className="actions-list">
              {actions && actions.length > 0 ? (
                actions.map((action, index) => {
                  // Use both id and index for key to ensure React detects changes
                  const actionKey = action.id || `action-${index}`;
                  return (
                    <button
                      key={actionKey}
                      className={`action-item ${selectedAction === action.id ? "selected" : ""}`}
                      onClick={() => onActionSelect(action.id)}
                      aria-pressed={selectedAction === action.id}
                    >
                      <span className={`action-icon ${action.icon || 'lightbulb'}`}>
                        {getActionIcon(action.icon || 'lightbulb')}
                      </span>
                      <span className="action-label" style={{ minWidth: 0, overflow: 'visible' }}>
                        {action.label || action.text || 'Untitled suggestion'}
                      </span>
                    </button>
                  );
                })
              ) : (
                <div className="actions-empty">No suggestions yet. Keep talking to generate AI suggestions.</div>
              )}
            </div>
          </div>
    </div>
  );
}

export default LiveInsightsPanel;
