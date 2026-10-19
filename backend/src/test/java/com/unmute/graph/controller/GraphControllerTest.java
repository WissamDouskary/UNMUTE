package com.unmute.graph.controller;

import com.unmute.common.exception.BadRequestException;
import com.unmute.graph.dto.GraphEdgeType;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class GraphControllerTest {

    @Test
    void aBlankListMeansEveryRelationship() {
        assertThat(GraphController.relationTypes(null)).isEmpty();
        assertThat(GraphController.relationTypes(List.of(" ", ""))).isEmpty();
    }

    @Test
    void namedTypesAreParsed() {
        assertThat(GraphController.relationTypes(List.of("TASK_OF_NOTE", " NOTE_TAGGED ")))
                .containsExactlyInAnyOrder(GraphEdgeType.TASK_OF_NOTE, GraphEdgeType.NOTE_TAGGED);
    }

    @Test
    void anUnknownTypeIsRejected() {
        assertThatThrownBy(() -> GraphController.relationTypes(List.of("DEPENDS_ON")))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("DEPENDS_ON");
    }
}
