package chatbot

import (
	"embed"
	"fmt"
	"regexp"
	"strings"
	"unicode"
)

// Prompt copy lives in these Markdown files, not in Go, so it can be edited
// without touching code. They are embedded into the binary at build time.
//
//	go:embed directives below
//
// system.md placeholders:
//
//	{{LANGUAGE_INSTRUCTION}} — per-locale reply language line
//	{{KNOWLEDGE}}            — contents of knowledge.md
const (
	systemPromptFile    = "prompts/system.md"
	knowledgePromptFile = "prompts/knowledge.md"
)

//go:embed prompts/system.md
//go:embed prompts/knowledge.md
var promptFS embed.FS

func mustPrompt(name string) string {
	data, err := promptFS.ReadFile(name)
	if err != nil {
		// An embedded file can only be missing due to a build error.
		panic("chatbot: missing embedded prompt file " + name + ": " + err.Error())
	}
	return string(data)
}

var (
	systemPromptTemplate = mustPrompt(systemPromptFile)
	knowledgeBase        = mustPrompt(knowledgePromptFile)
)

const (
	// MaxMessageChars caps each user/assistant message the browser may send.
	MaxMessageChars = 1000
	// MaxContextMessages caps the accepted history (12 user/assistant turns).
	MaxContextMessages = 12
	// MaxOutputTokens keeps replies short and cheap.
	MaxOutputTokens = 512

	systemRole  = "system"
	userRole    = "user"
	assistantRl = "assistant"
)

// ChatRequest is the public payload accepted by POST /chat/stream.
type ChatRequest struct {
	Locale   string    `json:"locale"`
	Messages []Message `json:"messages"`
}

var localePattern = regexp.MustCompile(`^[a-z]{2,3}(-[a-z0-9]{1,8})*$`)

// ValidationError describes an unacceptable request. The message is safe to
// show to visitors (it never echoes request content).
type ValidationError struct {
	Reason string
}

func (e *ValidationError) Error() string { return e.Reason }

// sanitizeContent strips control characters (except newlines/tabs) and
// trims surrounding whitespace. Message contents are never logged.
func sanitizeContent(s string) string {
	var b strings.Builder
	b.Grow(len(s))
	for _, r := range s {
		if r == '\n' || r == '\t' || unicode.IsPrint(r) {
			b.WriteRune(r)
		}
	}
	return strings.TrimSpace(b.String())
}

// Validate normalizes and checks the request. On success, locale is
// lowercased (defaults to English) and messages are sanitized, capped and
// guaranteed to end with a user turn. The system role is rejected so the
// browser can never inject instructions.
func (r *ChatRequest) Validate() error {
	r.Locale = strings.ToLower(strings.TrimSpace(r.Locale))
	if r.Locale == "" {
		r.Locale = "en"
	}
	if len(r.Locale) > 35 || !localePattern.MatchString(r.Locale) {
		return &ValidationError{Reason: "invalid locale"}
	}

	if len(r.Messages) == 0 {
		return &ValidationError{Reason: "messages must not be empty"}
	}
	if len(r.Messages) > MaxContextMessages {
		r.Messages = r.Messages[len(r.Messages)-MaxContextMessages:]
	}

	cleaned := make([]Message, 0, len(r.Messages))
	for _, m := range r.Messages {
		role := strings.TrimSpace(m.Role)
		if role != userRole && role != assistantRl {
			return &ValidationError{Reason: "only user and assistant roles are allowed"}
		}
		content := sanitizeContent(m.Content)
		if content == "" {
			return &ValidationError{Reason: "messages must not be empty"}
		}
		if len(content) > MaxMessageChars {
			return &ValidationError{Reason: "message is too long"}
		}
		cleaned = append(cleaned, Message{Role: role, Content: content})
	}
	if cleaned[len(cleaned)-1].Role != userRole {
		return &ValidationError{Reason: "the last message must come from the user"}
	}
	r.Messages = cleaned
	return nil
}

// languageInstruction maps known UI locales to reply-language guidance,
// substituted into system.md's {{LANGUAGE_INSTRUCTION}} placeholder.
func languageInstruction(locale string) string {
	base := strings.SplitN(locale, "-", 2)[0]
	switch base {
	case "en":
		return "Reply in English."
	case "te":
		return "Reply in Telugu (script). If you cannot write reliable Telugu, reply in clear simple English instead."
	case "hi":
		return "Reply in Hindi (Devanagari script). If you cannot write reliable Hindi, reply in clear simple English instead."
	case "zh":
		return "Reply in Chinese."
	default:
		return fmt.Sprintf("The visitor prefers language tag %q. Reply in that language if you can do so reliably; otherwise reply in clear simple English.", locale)
	}
}

// ReplyLocaleSupported reports whether the provider is expected to handle the
// locale natively; when false the server emits a fallback notice event.
func ReplyLocaleSupported(locale string) bool {
	base := strings.SplitN(locale, "-", 2)[0]
	return base == "en" || base == "zh"
}

// BuildProviderMessages prepends the server-owned system prompt (loaded from
// prompts/*.md). The browser never supplies system instructions or
// authoritative product data.
func BuildProviderMessages(locale string, history []Message) []Message {
	prompt := strings.ReplaceAll(systemPromptTemplate, "{{LANGUAGE_INSTRUCTION}}", languageInstruction(locale))
	prompt = strings.ReplaceAll(prompt, "{{KNOWLEDGE}}", knowledgeBase)

	out := make([]Message, 0, len(history)+1)
	out = append(out, Message{Role: systemRole, Content: prompt})
	out = append(out, history...)
	return out
}

// productNames maps display names (lowercased; English) and localized names
// (Telugu/Hindi, as written in the website locale files) to catalog slugs so
// the server can attach product links to a completed reply in any language.
var productNames = map[string]string{
	"ragi jawa":          "ragi-jawa",
	"ragi malt":          "ragi-malt-sweet",
	"sweet ragi malt":    "ragi-malt-sweet",
	"ragi malt (sweet)":  "ragi-malt-sweet",
	"salted ragi malt":   "ragi-malt-salted",
	"ragi malt (salted)": "ragi-malt-salted",
	"mixed sprouts":      "mixed-sprouts",
	"green gram sprouts": "green-gram-sprouts",
	"pesalu":             "green-gram-sprouts",
	"orange juice":       "orange-juice",
	"watermelon juice":   "watermelon-juice",
	"mosambi juice":      "mosambi-juice",
	"sweet lime juice":   "mosambi-juice",
	"sprout salad":       "sprout-salad",

	// Telugu (from clients/apps/user/src/i18n/locales/te.ts)
	"రాగి జావ":         "ragi-jawa",
	"రాగి మాల్ట్":      "ragi-malt-sweet",
	"మిక్స్‌డ్ మొలకలు": "mixed-sprouts",
	"పెసల మొలకలు":      "green-gram-sprouts",
	"నారింజ రసం":       "orange-juice",
	"పుచ్చకాయ రసం":     "watermelon-juice",
	"మోసంబి రసం":       "mosambi-juice",
	"మొలకల సలాడ్":      "sprout-salad",

	// Hindi (from clients/apps/user/src/i18n/locales/hi.ts)
	"रागी जाव":      "ragi-jawa",
	"रागी माल्ट":    "ragi-malt-sweet",
	"मिक्स अंकुरित": "mixed-sprouts",
	"मूँग के अंकुर": "green-gram-sprouts",
	"मूंग के अंकुर": "green-gram-sprouts",
	"संतरे का जूस":  "orange-juice",
	"तरबूज़ का जूस": "watermelon-juice",
	"तरबूज का जूस":  "watermelon-juice",
	"मौसमी का जूस":  "mosambi-juice",
	"अंकुरित सलाद":  "sprout-salad",
}

// matchOrder checks longer aliases first so "ragi malt (salted)" is not
// shadowed by the generic "ragi malt".
var matchOrder = []string{
	"ragi malt (salted)", "salted ragi malt",
	"ragi malt (sweet)", "sweet ragi malt", "ragi malt",
	"ragi jawa",
	"mixed sprouts",
	"green gram sprouts", "pesalu",
	"orange juice",
	"watermelon juice",
	"mosambi juice", "sweet lime juice",
	"sprout salad",
	// Localized names last (no substring overlap with English), in catalog
	// order: Telugu then Hindi.
	"రాగి జావ",
	"రాగి మాల్ట్",
	"మిక్స్‌డ్ మొలకలు",
	"పెసల మొలకలు",
	"నారింజ రసం",
	"పుచ్చకాయ రసం",
	"మోసంబి రసం",
	"మొలకల సలాడ్",
	"रागी जाव",
	"रागी माल्ट",
	"मिक्स अंकुरित",
	"मूँग के अंकुर",
	"मूंग के अंकुर",
	"संतरे का जूस",
	"तरबूज़ का जूस",
	"तरबूज का जूस",
	"मौसमी का जूस",
	"अंकुरित सलाद",
}

// MatchProducts returns catalog slugs whose names appear in the reply text,
// preserving catalog order. Used to attach product links to the answer.
func MatchProducts(text string) []string {
	lower := strings.ToLower(text)
	seen := make(map[string]bool)
	var slugs []string
	for _, name := range matchOrder {
		slug, ok := productNames[name]
		if !ok || seen[slug] {
			continue
		}
		// A specific malt variant beats the generic "ragi malt" alias, whose
		// text is a substring of both variants.
		if name == "ragi malt" &&
			(seen["ragi-malt-sweet"] || seen["ragi-malt-salted"]) {
			continue
		}
		if strings.Contains(lower, name) {
			seen[slug] = true
			slugs = append(slugs, slug)
		}
	}
	return slugs
}

// ClientIP resolves the caller IP for rate limiting. It trusts a single
// X-Forwarded-For hop (the reverse proxy in front of the API).
func ClientIP(forwardedFor, remoteAddr string) string {
	if forwardedFor != "" {
		first := strings.TrimSpace(strings.SplitN(forwardedFor, ",", 2)[0])
		if first != "" {
			return first
		}
	}
	host := remoteAddr
	if idx := strings.LastIndex(remoteAddr, ":"); idx > 0 {
		host = remoteAddr[:idx]
	}
	return strings.Trim(host, "[]")
}
