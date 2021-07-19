import React from "react";
import PropTypes from "prop-types";
import { t } from "ttag";

import * as Urls from "metabase/lib/urls";
import { Container, Icon, Link } from "./CollectionSidebarFooter.styled";

const propTypes = {
  isSuperUser: PropTypes.bool.isRequired,
};

export default function CollectionSidebarFooter({ isSuperUser }) {
  return (
    <Container>
      {isSuperUser && (
        <Link to={Urls.collection({ id: "users" })}>
          <Icon name="group" />
          {t`Other users' personal collections`}
        </Link>
      )}

      <Link to={`/archive`}>
        <Icon name="view_archive" />
        {t`View archive`}
      </Link>
    </Container>
  );
}

CollectionSidebarFooter.propTypes = propTypes;
