-- User-reviewed connections. Foreign-key edges stay derived. These rows are only
-- created when someone accepts a suggestion.

CREATE TABLE graph_suggestions (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id        UUID NOT NULL,
    source_key     VARCHAR(80) NOT NULL,
    target_key     VARCHAR(80) NOT NULL,
    relation_type  VARCHAR(40) NOT NULL,
    explanation    TEXT NOT NULL,
    evidence       TEXT,
    origin         VARCHAR(20) NOT NULL,
    status         VARCHAR(20) NOT NULL,
    created_at     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_graph_suggestions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT uq_graph_suggestions_pair UNIQUE (user_id, source_key, target_key, relation_type),
    CONSTRAINT ck_graph_suggestions_status CHECK (status IN ('PENDING', 'ACCEPTED', 'REJECTED')),
    CONSTRAINT ck_graph_suggestions_order CHECK (source_key < target_key)
);

CREATE INDEX idx_graph_suggestions_user_status ON graph_suggestions (user_id, status);

CREATE TABLE graph_links (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id        UUID NOT NULL,
    source_key     VARCHAR(80) NOT NULL,
    target_key     VARCHAR(80) NOT NULL,
    relation_type  VARCHAR(40) NOT NULL,
    origin         VARCHAR(20) NOT NULL,
    created_at     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_graph_links_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT uq_graph_links_pair UNIQUE (user_id, source_key, target_key, relation_type),
    CONSTRAINT ck_graph_links_order CHECK (source_key < target_key)
);

CREATE INDEX idx_graph_links_user ON graph_links (user_id);
